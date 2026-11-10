import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApiServer,type AppInstance} from '../apps/api/src/app.ts';
async function fixture(fn:(app:AppInstance)=>Promise<void>){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiit-escalation-parity-'));try{await fn(createApiServer(path.join(dir,'db.json')));}finally{fs.rmSync(dir,{recursive:true,force:true});}}
async function login(app:AppInstance,role:string){const user=app.store.getState().users.find(u=>u.roleName===role)!;const r=await app.inject({method:'POST',url:'/api/auth/login',body:{email:user.email}});assert.equal(r.status,200);return r.data.token as string;}
for(const route of ['transition','escalate-cto']) {
 const body=(reason:unknown)=>route==='transition'?{status:'ESCALATED_TO_CTO',notes:reason}:{reason};
 for(const role of ['IT_ADMIN','CTO'])test(`Day3 parity ${route} ${role} escalation includes critical severity and governance`,()=>fixture(async app=>{
  const token=await login(app,role);const ticket=app.store.getState().tickets.find(t=>t.id==='ticket-seed-1002')!;
  const response=await app.inject({method:'POST',url:`/api/tickets/${ticket.id}/${route}`,token,body:body('  Outage password=TEST_ONLY  ')});assert.equal(response.status,200);
  assert.equal(response.data.ticket.severity,'CRITICAL');assert.equal(response.data.ticket.status,'ESCALATED_TO_CTO');assert.equal(response.data.ticket.escalationReason,'Outage password=[REDACTED_SECRET]');
  const state=app.store.getState();const event=state.ticketEvents.at(-1)!;assert.equal(event.eventType,'ESCALATED_TO_CTO');assert.equal(event.metadata.reason,response.data.ticket.escalationReason);
  assert.ok(state.auditLogs.some(a=>a.resourceId===ticket.id&&a.action==='TICKET_ESCALATED_TO_CTO'));assert.ok(state.notifications.some(n=>n.ticketId===ticket.id&&n.recipientId==='user-cto-farhana'));
 }));
 test(`Day3 parity ${route} rejects invalid reasons and preserves exact state`,()=>fixture(async app=>{
  const token=await login(app,'IT_ADMIN');const before=JSON.stringify(app.store.getState());
  for(const reason of [undefined,'','  ','abcd','a b c d']) {const r=await app.inject({method:'POST',url:`/api/tickets/ticket-seed-1002/${route}`,token,body:body(reason)});assert.equal(r.status,400);assert.equal(JSON.stringify(app.store.getState()),before);}
 }));
 test(`Day3 parity ${route} denies requesters and CTO-review bypass`,()=>fixture(async app=>{
  for(const role of ['EMPLOYEE','CUSTOMER']) {const token=await login(app,role);const before=JSON.stringify(app.store.getState().tickets);const r=await app.inject({method:'POST',url:`/api/tickets/ticket-seed-1002/${route}`,token,body:body('Meaningful reason')});assert.equal(r.status,403);assert.equal(JSON.stringify(app.store.getState().tickets),before);}
  const token=await login(app,'IT_ADMIN');const before=JSON.stringify(app.store.getState().tickets);const r=await app.inject({method:'POST',url:`/api/tickets/ticket-seed-1003/${route}`,token,body:body('Meaningful reason')});assert.equal(r.status,400);assert.equal(JSON.stringify(app.store.getState().tickets),before);
 }));
 test(`Day3 parity ${route} notification failure rolls back all business changes`,()=>fixture(async app=>{
  const token=await login(app,'IT_ADMIN');const before=JSON.stringify(app.store.getState());app.queueProcessor.enqueueNotification=async()=>{throw new Error('Synthetic enqueue failure');};
  const r=await app.inject({method:'POST',url:`/api/tickets/ticket-seed-1002/${route}`,token,body:body('Meaningful reason')});assert.equal(r.status,500);assert.equal(JSON.stringify(app.store.getState()),before);
 }));
}
