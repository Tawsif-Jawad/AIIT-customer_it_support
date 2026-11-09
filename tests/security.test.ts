import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createApiServer} from '../apps/api/src/app.ts';
import {issueOIDCToken} from '../apps/api/src/auth.ts';
import {ALLOWED_TICKET_TRANSITIONS,validateStatusTransition,type RoleName,type TicketStatus} from '../packages/shared/src/index.ts';

async function fixture(fn:(app:ReturnType<typeof createApiServer>)=>Promise<void>) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiit-security-'));
 try { await fn(createApiServer(path.join(dir,'db.json'))); } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
const login=async(app:ReturnType<typeof createApiServer>,email='tawsif.zawad@upstra.com')=>app.inject({method:'POST',url:'/api/auth/login',body:{email,role:'CTO',sbuId:'sbu-fin-002'}});

test('cookie writes reject missing/foreign Origin; same-origin logout revokes cookie and bearer',()=>fixture(async app=>{
 const auth=await login(app);const cookie=auth.headers['set-cookie'].split(';')[0];
 assert.match(auth.headers['set-cookie'],/HttpOnly/);assert.match(auth.headers['set-cookie'],/SameSite=Strict/);
 assert.equal(auth.data.user.roleName,'EMPLOYEE');
 for(const headers of [{cookie},{cookie,origin:'https://attacker.example'}] as Record<string,string>[]) assert.equal((await app.inject({method:'POST',url:'/api/auth/logout',headers})).status,403);
 assert.equal((await app.inject({method:'GET',url:'/api/auth/me',headers:{cookie}})).status,200);
 assert.equal((await app.inject({method:'POST',url:'/api/auth/logout',headers:{cookie,origin:'http://localhost:4000'}})).status,200);
 assert.equal((await app.inject({method:'GET',url:'/api/auth/me',token:auth.data.token})).status,401);
}));
test('expired signed tokens and expired stored sessions fail closed across restart',()=>fixture(async app=>{
 const auth=await login(app);const state=app.store.getState();
 state.authSessions![0].expiresAt=Date.now()-1;app.store.persist();
 assert.equal((await app.inject({method:'GET',url:'/api/auth/me',token:auth.data.token})).status,401);
 const token=issueOIDCToken(state.users[0],-1);
 const current=app.store.getState();current.authSessions!.push({id:crypto.createHash('sha256').update(token).digest('hex'),userId:state.users[0].id,expiresAt:Date.now()+60000});app.store.persist();
 assert.equal((await app.inject({method:'GET',url:'/api/auth/me',token})).status,401);
}));
test('role revocation and service conversion apply to existing sessions immediately',()=>fixture(async app=>{
 const auth=await login(app,'kamal.hossain@upstra.local');
 const user=app.store.getState().users.find(u=>u.email==='kamal.hossain@upstra.local')!;
 user.roleId='role-employee';user.roleName='EMPLOYEE';app.store.persist();
 assert.equal((await app.inject({method:'GET',url:'/api/approvals',token:auth.data.token})).status,403);
 const service=app.store.getState().users.find(u=>u.id===user.id)!;service.roleId='role-system';service.roleName='SYSTEM_SERVICE';app.store.persist();
 assert.equal((await app.inject({method:'GET',url:'/api/auth/me',token:auth.data.token})).status,401);
 assert.equal((await login(app,user.email)).status,401);
}));
test('customer ownership and employee asset SBU boundaries do not change global IT grant',()=>fixture(async app=>{
 const customer=(await login(app,'rahim.chowdhury@client.upstra.local')).data.token;
 const employee=(await login(app)).data.token;
 const it=(await login(app,'kamal.hossain@upstra.local')).data.token;
 const ticket=app.store.getState().tickets.find(t=>t.requesterId==='user-emp-tawsif')!;
 assert.equal((await app.inject({method:'GET',url:`/api/tickets/${ticket.id}`,token:customer})).status,403);
 assert.equal((await app.inject({method:'GET',url:`/api/tickets/${ticket.id}`,token:it})).status,200);
 const asset=app.store.getState().assets.find(a=>a.assignedUserId==='user-emp-tawsif')!;
 asset.sbuId='sbu-fin-002';app.store.persist();
 const items=(await app.inject({method:'GET',url:'/api/assets',token:employee})).data.items;
 assert.ok(!items.some((a:{id:string})=>a.id===asset.id));
 assert.equal((await app.inject({method:'POST',url:`/api/assets/${asset.id}/acknowledge`,token:employee})).status,403);
}));
test('all role/state pairs obey requester, CTO-review, closure and service boundaries',()=>{
 const states=Object.keys(ALLOWED_TICKET_TRANSITIONS) as TicketStatus[];
 for(const role of ['EMPLOYEE','CUSTOMER','IT_ADMIN','CTO','SYSTEM_SERVICE'] as RoleName[]) for(const from of states) for(const to of states) {
  const check=validateStatusTransition(from,to,role,true);
  const edge=from!==to&&ALLOWED_TICKET_TRANSITIONS[from].includes(to);
  let expected=edge;
  if(role==='EMPLOYEE'||role==='CUSTOMER') expected=edge&&((from==='RESOLVED_PENDING_CONFIRMATION'&&to==='CLOSED')||(['CLOSED','RESOLVED_PENDING_CONFIRMATION'].includes(from)&&to==='REOPENED'));
  else if(role==='IT_ADMIN') expected=edge&&from!=='ESCALATED_TO_CTO'&&(to!=='CLOSED'||from==='RESOLVED_PENDING_CONFIRMATION');
  else if(role==='CTO') expected=edge&&(to!=='CLOSED'||from==='RESOLVED_PENDING_CONFIRMATION');
  else expected=edge&&['NEW','TRIAGED','AI_HANDLING','FAILED_RETRY'].includes(from)&&['TRIAGED','AI_HANDLING','RESOLVED_PENDING_CONFIRMATION','ASSIGNED_TO_IT','FAILED_RETRY'].includes(to);
  assert.equal(check.valid,expected,`${role} ${from} -> ${to}`);
 }
});
test('JSON arrays/null and oversized bodies fail without changing ticket state',()=>fixture(async app=>{
 const token=(await login(app)).data.token;const before=app.store.getState().tickets.length;
 assert.equal((await app.inject({method:'POST',url:'/api/tickets',token,body:{description:'x'.repeat(1024*1024+1)}})).status,413);
 for(const body of [null,[]]) assert.equal((await app.inject({method:'POST',url:'/api/tickets',token,body:body as unknown as Record<string,unknown>})).status,400);
 assert.equal((await app.inject({method:'GET',url:'/api/auth/me',headers:{cookie:'itsupport_session=%invalid'}})).status,401);
 assert.equal(app.store.getState().tickets.length,before);
 assert.equal((await app.inject({method:'GET',url:'/api/auth/me',token,headers:{origin:'https://attacker.example'}})).status,403);
 const res=await app.inject({method:'GET',url:'/api/health'});assert.equal(res.headers['access-control-allow-origin'],undefined);
}));
