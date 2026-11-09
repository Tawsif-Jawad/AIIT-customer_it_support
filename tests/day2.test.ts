import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EnterpriseDataStore } from '../apps/api/src/store.ts';
import { createApiServer } from '../apps/api/src/app.ts';
import { canAccessTicket, validateStatusTransition } from '../packages/shared/src/index.ts';

function fixture(fn: (file: string) => void | Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiit-day2-'));
  return Promise.resolve().then(() => fn(path.join(dir, 'db.json'))).finally(() => fs.rmSync(dir, {recursive:true,force:true}));
}
test('F01 stale independent writer cannot overwrite a committed record', () => fixture(file => {
  const a = new EnterpriseDataStore(file), b = new EnterpriseDataStore(file);
  a.getState().tickets[0].title = 'writer one committed'; a.persist();
  b.getState().tickets[1].title = 'stale writer';
  assert.throws(() => b.persist(), /PERSISTENCE_CONFLICT/);
  assert.equal(new EnterpriseDataStore(file).getState().tickets[0].title, 'writer one committed');
}));
test('F14 invalid collections and duplicate IDs fail closed', () => fixture(file => {
  const a = new EnterpriseDataStore(file);
  a.getState().tickets.push({...a.getState().tickets[0]});
  assert.throws(() => a.persist(), /PERSISTENCE_INVALID/);
}));
test('F05 requester cannot close unresolved escalation or approval', () => {
  for (const from of ['ESCALATED_TO_CTO','AWAITING_APPROVAL','AWAITING_USER'] as const)
    assert.equal(validateStatusTransition(from, 'CLOSED', 'EMPLOYEE', true).valid, false);
});
test('F04 approvals require rationale and cannot be replayed', () => fixture(async file => {
  const app = createApiServer(file);
  const login = await app.inject({method:'POST',url:'/api/auth/login',body:{email:'farhana.ahmed@upstra.local'}});
  const token = login.data.token;
  const id = app.store.getState().approvals.find(a => a.status === 'PENDING')!.id;
  const decide = (body: Record<string,unknown>) => app.inject({method:'POST',url:`/api/approvals/${id}/decide`,token,body});
  assert.equal((await decide({decision:'APPROVED'})).status,400);
  assert.equal((await decide({decision:'APPROVED',decisionNotes:'Reviewed exact simulated request'})).status,200);
  assert.equal((await decide({decision:'REJECTED',decisionNotes:'Replay attempt'})).status,409);
}));
test('F03 logout invalidates bearer session', () => fixture(async file => {
  const app = createApiServer(file);
  const login = await app.inject({method:'POST',url:'/api/auth/login',body:{email:'tawsif.zawad@upstra.com'}});
  const token = login.data.token;
  assert.equal((await app.inject({method:'POST',url:'/api/auth/logout',token})).status,200);
  assert.equal((await app.inject({method:'GET',url:'/api/auth/me',token})).status,401);
}));

test('parallel ticket requests preserve tickets, audit and unique numbers after restart', () => fixture(async file => {
  const app = createApiServer(file);
  const token = (await app.inject({method:'POST',url:'/api/auth/login',body:{email:'tawsif.zawad@upstra.com',role:'CTO',sbuId:'untrusted'}})).data.token;
  const before = app.store.getState().tickets.length;
  const results = await Promise.all(Array.from({length:12}, (_, i) => app.inject({method:'POST',url:'/api/tickets',token,body:{serviceCategoryId:'cat-outlook-config',title:`Configure Outlook profile number ${i}`,description:'Help configuring Outlook with secure TLS settings on my laptop',severity:'LOW'}})));
  assert.ok(results.every(r => r.status === 201));
  const restarted = createApiServer(file);
  const state = restarted.store.getState();
  assert.equal(state.tickets.length, before + 12);
  assert.equal(new Set(state.tickets.map(t => t.ticketNumber)).size, state.tickets.length);
  assert.equal(state.auditLogs.filter(a => a.action === 'TICKET_CREATED').length >= 12,true);
  assert.equal((await restarted.inject({method:'GET',url:'/api/auth/me',token})).data.user.roleName,'EMPLOYEE');
  assert.equal((await restarted.inject({method:'GET',url:'/api/audit-logs',token})).status,403);
  assert.equal((await restarted.inject({method:'GET',url:'/api/tickets'})).status,401);
}));
test('failed replacement returns failure, rolls back memory and preserves exact file', () => fixture(async file => {
  const app = createApiServer(file);
  const token = (await app.inject({method:'POST',url:'/api/auth/login',body:{email:'tawsif.zawad@upstra.com'}})).data.token;
  const before = fs.readFileSync(file,'utf8');
  const rename = fs.renameSync;
  fs.renameSync = () => { throw new Error('synthetic interrupted replacement'); };
  try {
    const res = await app.inject({method:'POST',url:'/api/tickets',token,body:{serviceCategoryId:'cat-outlook-config',title:'Interrupted Outlook request',description:'Help configuring secure Outlook on my laptop'}});
    assert.equal(res.status,503);
    assert.equal(fs.readFileSync(file,'utf8'),before);
    assert.deepEqual(app.store.getState(),JSON.parse(before));
  } finally { fs.renameSync = rename; }
  assert.equal(fs.existsSync(file+'.lock'),false);
  assert.equal(fs.readdirSync(path.dirname(file)).some(n => n.endsWith('.tmp')),false);
}));
test('cross-process transaction lease blocks a second writer without losing first commit', () => fixture(async file => {
  const {spawn} = await import('node:child_process');
  const store = new EnterpriseDataStore(file);
  await store.transaction(async () => {
    store.getState().tickets[0].title = 'parent committed';
    const moduleUrl = new URL('../apps/api/src/store.ts',import.meta.url).href;
    const code = `import {EnterpriseDataStore} from ${JSON.stringify(moduleUrl)}; const s = new EnterpriseDataStore(${JSON.stringify(file)}); s.getState().tickets[1].title='child'; s.persist();`;
    const child = spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','ignore','pipe']});
    let error = ''; child.stderr.on('data',chunk => error += chunk);
    const exit = await new Promise(resolve => child.on('close',resolve));
    assert.equal(exit,1); assert.match(error,/PERSISTENCE_BUSY/);
    return true;
  });
  assert.equal(new EnterpriseDataStore(file).getState().tickets[0].title,'parent committed');
}));
test('opposing approval decisions serialize to one immutable decision', () => fixture(async file => {
  const app = createApiServer(file);
  const token = (await app.inject({method:'POST',url:'/api/auth/login',body:{email:'farhana.ahmed@upstra.local'}})).data.token;
  const id = app.store.getState().approvals.find(a => a.status === 'PENDING')!.id;
  const results = await Promise.all(['APPROVED','REJECTED'].map(decision => app.inject({method:'POST',url:`/api/approvals/${id}/decide`,token,body:{decision,decisionNotes:'Reviewed simulated action'}})));
  assert.deepEqual(results.map(r => r.status).sort(),[200,409]);
}));
test('malformed collections, broken references, and stale lease never overwrite data', () => fixture(async file => {
  const store = new EnterpriseDataStore(file);
  const raw = fs.readFileSync(file,'utf8');
  store.getState().tickets[0].requesterId = 'missing';
  assert.throws(() => store.persist(),/PERSISTENCE_INVALID/);
  assert.equal(fs.readFileSync(file,'utf8'),raw);
  fs.writeFileSync(file+'.lock','synthetic abandoned writer');
  assert.throws(() => new EnterpriseDataStore(file).persist(),/PERSISTENCE_BUSY/);
  assert.equal(fs.readFileSync(file,'utf8'),raw);
  fs.unlinkSync(file+'.lock');
  const malformed = {...JSON.parse(raw),notifications:{}};
  fs.writeFileSync(file,JSON.stringify(malformed));
  assert.throws(() => new EnterpriseDataStore(file),/PERSISTENCE_INVALID/);
}));
test('reset is disabled and service identity cannot bypass ticket ownership', () => fixture(file => {
  const store = new EnterpriseDataStore(file);
  assert.throws(() => store.resetAndSeed(),/RESET_DISABLED/);
  assert.equal(canAccessTicket({...store.getState().users[0],roleName:'SYSTEM_SERVICE'},store.getState().tickets[0]),false);
}));
test('object authorization, approval roles, CTO state and sensitive notes are enforced', () => fixture(async file => {
  const app = createApiServer(file);
  const login = async (email: string) => (await app.inject({method:'POST',url:'/api/auth/login',body:{email}})).data.token;
  const employee = await login('tawsif.zawad@upstra.com'), other = await login('nadia.islam@upstra.local'), it = await login('kamal.hossain@upstra.local'), cto = await login('farhana.ahmed@upstra.local');
  const ticket = app.store.getState().tickets.find(t => t.requesterId === 'user-emp-tawsif')!;
  ticket.status = 'ESCALATED_TO_CTO'; app.store.persist();
  const request = (token: string, method: string, url: string, body?: Record<string,unknown>) => app.inject({token,method,url,body});
  assert.equal((await request(employee,'GET',`/api/tickets/${ticket.id}`)).status,200);
  assert.equal((await request(other,'GET',`/api/tickets/${ticket.id}`)).status,403);
  assert.equal((await request(employee,'POST',`/api/tickets/${ticket.id}/transition`,{status:'CLOSED'})).status,403);
  assert.equal((await request(it,'POST',`/api/tickets/${ticket.id}/transition`,{status:'IN_PROGRESS'})).status,403);
  const critical = app.store.getState().approvals.find(a => a.requiredRole === 'CTO')!;
  assert.equal((await request(it,'POST',`/api/approvals/${critical.id}/decide`,{decision:'APPROVED',decisionNotes:'Unauthorized'})).status,403);
  assert.equal((await request(employee,'POST',`/api/approvals/${critical.id}/decide`,{decision:'APPROVED',decisionNotes:'Unauthorized'})).status,403);
  const result = await request(cto,'POST',`/api/tickets/${ticket.id}/transition`,{status:'RESOLVED_PENDING_CONFIRMATION',notes:'password=Day2SyntheticSecret123'});
  assert.equal(result.status,200);
  assert.doesNotMatch(fs.readFileSync(file,'utf8'),/Day2SyntheticSecret123/);
}));
test('missing development opt-in fails closed and disabled accounts lose existing access', () => fixture(async file => {
  const app = createApiServer(file);
  const token = (await app.inject({method:'POST',url:'/api/auth/login',body:{email:'tawsif.zawad@upstra.com'}})).data.token;
  app.store.getState().users[0].isActive = false; app.store.persist();
  assert.equal((await app.inject({method:'GET',url:'/api/auth/me',token})).status,401);
  const previous = process.env.AUTH_MODE;
  try {
    delete process.env.AUTH_MODE;
    assert.equal((await app.inject({method:'POST',url:'/api/auth/login',body:{email:'farhana.ahmed@upstra.local'}})).status,503);
  } finally { if (previous !== undefined) process.env.AUTH_MODE = previous; }
}));
test('read-only migration dry run preserves source bytes and reports counts', () => fixture(async file => {
  new EnterpriseDataStore(file);
  const raw = fs.readFileSync(file,'utf8');
  const {execFileSync} = await import('node:child_process');
  const output = execFileSync(process.execPath,['scripts/validate-json-migration.ts',file],{encoding:'utf8'});
  assert.equal(JSON.parse(output).counts.users,5);
  assert.equal(fs.readFileSync(file,'utf8'),raw);
}));


test('F05 employee/customer cannot advance reopened ticket into IT-controlled work', () => {
  for (const role of ['EMPLOYEE', 'CUSTOMER'] as const) {
    assert.equal(validateStatusTransition('REOPENED', 'IN_PROGRESS', role, true).valid, false);
    assert.equal(validateStatusTransition('RESOLVED_PENDING_CONFIRMATION', 'CLOSED', role, true).valid, true);
    assert.equal(validateStatusTransition('CLOSED', 'REOPENED', role, true).valid, true);
    assert.equal(validateStatusTransition('CLOSED', 'REOPENED', role, false).valid, false);
  }
  assert.equal(validateStatusTransition('REOPENED', 'IN_PROGRESS', 'IT_ADMIN', false).valid, true);
});

test('F10 requested LOW cannot downgrade critical infrastructure classification', () => fixture(async file => {
  const app = createApiServer(file);
  const token = (await app.inject({method:'POST',url:'/api/auth/login',body:{email:'tawsif.zawad@upstra.com'}})).data.token;
  const result = await app.inject({method:'POST',url:'/api/tickets',token,body:{
    serviceCategoryId:'cat-outlook-config',
    title:'Entire SBU production outage',
    description:'Entire SBU production down due to a severe outage; urgent human IT review is required',
    severity:'LOW',
  }});
  assert.equal(result.status, 201);
  assert.equal(result.data.aiDecision.recommendedSeverity, 'CRITICAL');
  assert.equal(result.data.ticket.severity, 'CRITICAL');
  assert.equal(result.data.ticket.status, 'ASSIGNED_TO_IT');
}));

test('F10 user-reported HIGH priority is preserved and cannot auto-resolve', () => fixture(async file => {
  const app = createApiServer(file);
  const token = (await app.inject({method:'POST',url:'/api/auth/login',body:{email:'tawsif.zawad@upstra.com'}})).data.token;
  const result = await app.inject({method:'POST',url:'/api/tickets',token,body:{
    serviceCategoryId:'cat-outlook-config',
    title:'High-priority Outlook connectivity issue',
    description:'Outlook certificate prompts block my business-critical work despite normal troubleshooting',
    severity:'HIGH',
  }});
  assert.equal(result.status, 201);
  assert.equal(result.data.aiDecision.recommendedSeverity, 'LOW');
  assert.equal(result.data.ticket.severity, 'HIGH');
  assert.equal(result.data.ticket.status, 'ASSIGNED_TO_IT');
}));

test('F05 API denies employee IT-controlled work while allowing IT to resume it', () => fixture(async file => {
  const app = createApiServer(file);
  const employee = (await app.inject({method:'POST',url:'/api/auth/login',body:{email:'tawsif.zawad@upstra.com'}})).data.token;
  const it = (await app.inject({method:'POST',url:'/api/auth/login',body:{email:'kamal.hossain@upstra.local'}})).data.token;
  const ticket = app.store.getState().tickets.find(t => t.requesterId === 'user-emp-tawsif')!;
  ticket.status = 'REOPENED';
  app.store.persist();
  const url = `/api/tickets/${ticket.id}/transition`;
  const denied = await app.inject({method:'POST',url,token:employee,body:{status:'IN_PROGRESS'}});
  assert.equal(denied.status,403);
  assert.equal(app.store.getState().tickets.find(t => t.id === ticket.id)!.status,'REOPENED');
  const allowed = await app.inject({method:'POST',url,token:it,body:{status:'IN_PROGRESS'}});
  assert.equal(allowed.status,200);
  assert.equal(allowed.data.ticket.status,'IN_PROGRESS');
}));

test('independent API instances preserve concurrent updates through explicit contention retry',()=>fixture(async file=>{
 const a=createApiServer(file),b=createApiServer(file);
 const token=(await a.inject({method:'POST',url:'/api/auth/login',body:{email:'tawsif.zawad@upstra.com'}})).data.token;
 const ticket=a.store.getState().tickets.find(t=>t.requesterId==='user-emp-tawsif')!;
 const write=(app:ReturnType<typeof createApiServer>,text:string)=>app.inject({method:'POST',url:`/api/tickets/${ticket.id}/comments`,token,body:{body:text,isInternal:false}});
 const results=await Promise.all([write(a,'First concurrent synthetic comment'),write(b,'Second concurrent synthetic comment')]);
 assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===409).length,1);
 if(results[0].status===409) assert.equal((await write(a,'First concurrent synthetic comment')).status,201);
 if(results[1].status===409) assert.equal((await write(b,'Second concurrent synthetic comment')).status,201);
 const source=new EnterpriseDataStore(file).getState();
 assert.ok(source.ticketComments.some(c=>c.body==='First concurrent synthetic comment'));
 assert.ok(source.ticketComments.some(c=>c.body==='Second concurrent synthetic comment'));
}));
