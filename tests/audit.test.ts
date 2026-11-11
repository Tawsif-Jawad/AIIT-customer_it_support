import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApiServer} from '../apps/api/src/app.ts';
import {DevelopmentEmailTransport} from '../packages/connectors/src/index.ts';

async function fixture(fn:(app:ReturnType<typeof createApiServer>,file:string)=>Promise<void>){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiit-audit-'));const file=path.join(dir,'db.json');
 try{await fn(createApiServer(file),file);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
const login=async(app:ReturnType<typeof createApiServer>,email='tawsif.zawad@upstra.com')=>(await app.inject({method:'POST',url:'/api/auth/login',body:{email}})).data.token;

test('AU01 retired/unassigned assets cannot be resurrected through acknowledgement',()=>fixture(async app=>{
 const token=await login(app,'kamal.hossain@upstra.local');const asset=app.store.getState().assets[0];
 asset.status='RETIRED';asset.assignedUserId=null;asset.handoverAckStatus='RETURN_REQUESTED';app.store.persist();
 const result=await app.inject({method:'POST',url:`/api/assets/${asset.id}/acknowledge`,token});
 assert.equal(result.status,409);assert.equal(app.store.getState().assets[0].status,'RETIRED');
}));
test('AU02 repeated custody acknowledgement does not duplicate custody or audit history',()=>fixture(async app=>{
 const token=await login(app);const asset=app.store.getState().assets.find(a=>a.handoverAckStatus==='PENDING_EMPLOYEE_ACK')!;
 const request=()=>app.inject({method:'POST',url:`/api/assets/${asset.id}/acknowledge`,token});
 assert.equal((await request()).status,200);const history=app.store.getState().assets.find(a=>a.id===asset.id)!.history.length;const audits=app.store.getState().auditLogs.length;
 assert.equal((await request()).status,200);assert.equal(app.store.getState().assets.find(a=>a.id===asset.id)!.history.length,history);assert.equal(app.store.getState().auditLogs.length,audits);
}));
test('AU03 read-only health/catalog/ticket requests never replace the persisted dataset',()=>fixture(async app=>{
 const token=await login(app);let replacements=0;const rename=fs.renameSync;
 fs.renameSync=((...args:Parameters<typeof fs.renameSync>)=>{replacements++;return rename(...args);}) as typeof fs.renameSync;
 try{for(const url of ['/api/health','/api/catalog','/api/tickets','/api/analytics/summary'])assert.equal((await app.inject({method:'GET',url,token})).status,200);assert.equal(replacements,0);}finally{fs.renameSync=rename;}
}));
test('AU04 unsupported Mailpit transport cannot claim delivery or expose a ready state',async()=>{
 const mail=new DevelopmentEmailTransport({mode:'mailpit',smtpHost:'127.0.0.1',smtpPort:1,fromAddress:'fixture@example.test'});
 const health=await mail.getHealth();const result=await mail.sendEmail({to:'fixture@example.test',subject:'Fixture',textBody:'Synthetic only'});
 assert.equal(result.delivered,false);assert.equal(health.status,'UNAVAILABLE');assert.equal(mail.getDeliveredMessages().length,0);
});
test('AU05 local mock processing retries a failed notification after recovery',()=>fixture(async app=>{
 const recipient=app.store.getState().users[0];app.emailTransport.setSimulateFailure(true);
 await app.queueProcessor.enqueueNotification({ticketId:null,recipientId:recipient.id,recipientEmail:recipient.email,subject:'Retry fixture',body:'Synthetic notification'});
 assert.equal(app.store.getState().notifications[0].status,'FAILED');app.emailTransport.setSimulateFailure(false);
 assert.equal((await app.queueProcessor.processPendingJobs()).sentCount,1);assert.equal(app.store.getState().notifications[0].status,'SENT');
 const send=app.emailTransport.sendEmail.bind(app.emailTransport);app.emailTransport.sendEmail=async()=>{throw new Error('password=SyntheticTransportCanary');};
 try{await app.queueProcessor.enqueueNotification({ticketId:null,recipientId:recipient.id,recipientEmail:recipient.email,subject:'Throwing fixture',body:'Synthetic transport failure'});assert.equal(app.store.getState().notifications[0].status,'FAILED');assert.ok(!JSON.stringify(app.store.getState()).includes('SyntheticTransportCanary'));}finally{app.emailTransport.sendEmail=send;}
 assert.equal((await app.queueProcessor.processPendingJobs()).sentCount,1);
}));
test('AU06 invalid pagination is rejected instead of returning null metadata',()=>fixture(async app=>{
 const token=await login(app);for(const query of ['page=word','pageSize=Infinity','page=1.5'])assert.equal((await app.inject({method:'GET',url:'/api/tickets?'+query,token})).status,400);
}));

test('API inventory: public routes, authentication errors, protected resources and missing routes',()=>fixture(async app=>{
 for(const url of ['/api/health','/api/openapi.json','/api/auth/identities'])assert.equal((await app.inject({method:'GET',url})).status,200);
 assert.equal((await app.inject({method:'OPTIONS',url:'/api/tickets'})).status,204);
 assert.equal((await app.inject({method:'POST',url:'/api/auth/login',body:{}})).status,400);
 assert.equal((await app.inject({method:'POST',url:'/api/auth/login',body:{email:'absent@example.test'}})).status,401);
 for(const url of ['/api/auth/me','/api/catalog','/api/kb','/api/tickets','/api/approvals','/api/assets','/api/notifications','/api/analytics/summary','/api/audit-logs','/api/connectors/ad/lookup'])assert.equal((await app.inject({method:'GET',url})).status,401);
 const token=await login(app);for(const url of ['/api/auth/me','/api/catalog','/api/kb','/api/tickets','/api/assets','/api/notifications','/api/analytics/summary'])assert.equal((await app.inject({method:'GET',url,token})).status,200);
 assert.equal((await app.inject({method:'GET',url:'/api/unknown',token})).status,404);
 assert.equal((await app.inject({method:'DELETE',url:'/api/tickets',token})).status,404);
 assert.equal((await app.inject({method:'POST',url:'/api/auth/logout',token})).status,200);
 assert.equal((await app.inject({method:'GET',url:'/api/auth/me',token})).status,401);
}));
test('API inventory: category/KB filtering and authorized mock AD lookup',()=>fixture(async app=>{
 const token=await login(app);const it=await login(app,'kamal.hossain@upstra.local');
 assert.equal((await app.inject({method:'GET',url:'/api/catalog',token})).data.categories.length,6);
 const article=app.store.getState().knowledgeArticles[0];article.isApproved=false;app.store.persist();
 const kb=await app.inject({method:'GET',url:'/api/kb?q=outlook',token});assert.ok(!kb.data.items.some((a:{id:string})=>a.id===article.id));
 assert.equal((await app.inject({method:'GET',url:'/api/connectors/ad/lookup?email=fixture@example.test',token})).status,403);
 const ad=await app.inject({method:'GET',url:'/api/connectors/ad/lookup?email=kamal.hossain%40upstra.local',token:it});assert.equal(ad.status,200);assert.match(ad.data.provider,/mock/);assert.ok(ad.data.record);assert.ok(ad.data.groups.length);
 assert.equal((await app.inject({method:'GET',url:'/api/connectors/ad/lookup?email=absent%40example.test',token:it})).data.record,null);
}));
test('API inventory: ticket creation rejects malformed fields and uses trusted actor scope',()=>fixture(async app=>{
 const token=await login(app);
 for(const body of [{},{title:'x',description:'short',serviceCategoryId:'missing'},{title:'Fixture validation',description:'Synthetic long description',serviceCategoryId:'missing'},{title:'Fixture validation',description:'Synthetic long description',serviceCategoryId:'cat-outlook-config', customFormPayload: { osPlatform: 'macOS' },severity:'HUGE'}])assert.equal((await app.inject({method:'POST',url:'/api/tickets',token,body})).status,400);
 const r=await app.inject({method:'POST',url:'/api/tickets',token,body:{title:'Outlook configuration audit',description:'Configure Outlook incoming TLS on my laptop',serviceCategoryId:'cat-outlook-config', customFormPayload: { osPlatform: 'macOS' },role:'CTO',requesterId:'user-cto-farhana',sbuId:'sbu-fin-002'}});
 assert.equal(r.status,201);assert.equal(r.data.ticket.requesterId,'user-emp-tawsif');assert.equal(r.data.ticket.sbuId,'sbu-tech-001');
 const detail=await app.inject({method:'GET',url:`/api/tickets/${r.data.ticket.id}`,token});
 assert.deepEqual(detail.data.events.slice(0,3).map((e:{toStatus:string})=>e.toStatus),['NEW','TRIAGED','AI_HANDLING']);assert.ok(detail.data.aiLogs[0].dryRun);
 assert.ok(app.store.getState().auditLogs.some(a=>a.action==='TICKET_CREATED'&&a.resourceId===r.data.ticket.id));assert.ok(app.store.getState().notifications.some(n=>n.ticketId===r.data.ticket.id&&n.status==='SENT'));
 assert.equal((await app.inject({method:'GET',url:'/api/tickets/missing',token})).status,404);
}));
test('API inventory: search/filter/page boundaries return only authorized records',()=>fixture(async app=>{
 const token=await login(app);const template=app.store.getState().tickets.find(t=>t.requesterId==='user-emp-tawsif')!;
 for(let i=0;i<30;i++)app.store.getState().tickets.push({...template,id:'audit-page-'+i,ticketNumber:'AUDIT-PAGE-'+i,title:'Pagination-fixture '+i,severity:i%2?'HIGH':'LOW'});
 app.store.persist();
 const first=await app.inject({method:'GET',url:'/api/tickets?search=Pagination-fixture&page=1',token});const second=await app.inject({method:'GET',url:'/api/tickets?search=Pagination-fixture&page=2',token});assert.equal(first.data.items.length,25);assert.equal(second.data.items.length,5);assert.equal(first.data.pagination.totalPages,2);
 const filtered=await app.inject({method:'GET',url:'/api/tickets?search=Pagination-fixture&severity=HIGH&sbuId=sbu-tech-001',token});assert.equal(filtered.data.pagination.total,15);
 assert.equal((await app.inject({method:'GET',url:'/api/tickets?sbuId=sbu-fin-002',token})).data.items.length,0);
}));
test('API inventory: requester/IT/CTO lifecycle, comments, immutable approvals and restart',()=>fixture(async(app,file)=>{
 const employee=await login(app),it=await login(app,'kamal.hossain@upstra.local'),cto=await login(app,'farhana.ahmed@upstra.local');
 const created=await app.inject({method:'POST',url:'/api/tickets',token:employee,body:{title:'Audit AD privilege request',description:'Synthetic request requiring human IT administrator review',serviceCategoryId:'cat-ad-account', customFormPayload: { targetAdGroup: 'Synthetic readers', businessJustification: 'Synthetic review access' }}});const id=created.data.ticket.id;
 const action=(token:string,sub:string,body:Record<string,unknown>)=>app.inject({method:'POST',url:`/api/tickets/${id}/${sub}`,token,body});
 assert.equal(created.data.ticket.status,'ASSIGNED_TO_IT');assert.equal(created.data.ticket.assigneeId,'user-it-kamal');
 assert.equal((await action(it,'comments',{body:'Internal synthetic note',isInternal:true})).status,201);
 assert.equal((await action(employee,'comments',{body:'Requester synthetic update',isInternal:true})).data.comment.isInternal,false);
 const detail=await app.inject({method:'GET',url:`/api/tickets/${id}`,token:employee});assert.ok(!detail.data.comments.some((c:{isInternal:boolean})=>c.isInternal));
 assert.equal((await action(it,'transition',{status:'IN_PROGRESS'})).status,200);
 const approval=app.store.getState().approvals.find(a=>a.ticketId===id)!;
 assert.equal((await app.inject({method:'POST',url:`/api/approvals/${approval.id}/decide`,token:it,body:{decision:'APPROVED',decisionNotes:'Reviewed synthetic requirement'}})).status,200);
 assert.equal((await action(it,'escalate-cto',{reason:'Synthetic investigation needs executive review'})).status,200);
 assert.equal((await action(it,'transition',{status:'RESOLVED_PENDING_CONFIRMATION'})).status,403);
 assert.equal((await action(cto,'transition',{status:'RESOLVED_PENDING_CONFIRMATION'})).status,200);
 assert.equal((await action(employee,'transition',{status:'CLOSED'})).status,200);
 assert.equal((await action(employee,'transition',{status:'REOPENED'})).status,200);
 const restarted=createApiServer(file);assert.equal((await restarted.inject({method:'GET',url:`/api/tickets/${id}`,token:employee})).data.ticket.status,'REOPENED');
 assert.equal((await app.inject({method:'GET',url:'/api/audit-logs',token:it})).status,200);assert.equal((await app.inject({method:'GET',url:'/api/audit-logs',token:employee})).status,403);
 assert.equal((await app.inject({method:'GET',url:'/api/approvals',token:cto})).status,200);assert.equal((await app.inject({method:'POST',url:'/api/approvals/missing/decide',token:cto,body:{}})).status,404);
 assert.equal((await app.inject({method:'POST',url:'/api/assets/missing/acknowledge',token:employee})).status,404);
}));
test('API inventory: supported exceptional states enforce state graph and persist events',()=>fixture(async app=>{
 const token=await login(app,'kamal.hossain@upstra.local');const id=app.store.getState().tickets[0].id;
 for(const [from,to] of [['IN_PROGRESS','AWAITING_USER'],['AWAITING_USER','IN_PROGRESS'],['IN_PROGRESS','AWAITING_APPROVAL'],['AWAITING_APPROVAL','IN_PROGRESS'],['IN_PROGRESS','FAILED_RETRY'],['FAILED_RETRY','ASSIGNED_TO_IT']] as const){
  app.store.getState().tickets.find(t=>t.id===id)!.status=from;app.store.persist();
  const result=await app.inject({method:'POST',url:`/api/tickets/${id}/transition`,token,body:{status:to,notes:'Synthetic graph verification'}});assert.equal(result.status,200);assert.equal(result.data.ticket.status,to);assert.ok(app.store.getState().ticketEvents.some(e=>e.ticketId===id&&e.fromStatus===from&&e.toStatus===to));
 }
 const before=app.store.getState().tickets.find(t=>t.id===id)!.status;
 assert.equal((await app.inject({method:'POST',url:`/api/tickets/${id}/transition`,token,body:{status:'CLOSED'}})).status,403);assert.equal(app.store.getState().tickets.find(t=>t.id===id)!.status,before);
}));
test('AU10 malformed cookie logout clears safely instead of generating server error',()=>fixture(async app=>{
 const r=await app.inject({method:'POST',url:'/api/auth/logout',headers:{cookie:'itsupport_session=%invalid',origin:'http://localhost:4000'}});assert.equal(r.status,200);assert.match(r.headers['set-cookie'],/Max-Age=0/);
}));
test('API rate limiter rejects excess requests and recovers after its window',()=>fixture(async app=>{
 for(let i=0;i<250;i++)assert.equal((await app.inject({method:'GET',url:'/api/health'})).status,200);
 assert.equal((await app.inject({method:'GET',url:'/api/health'})).status,429);
 const now=Date.now;Date.now=()=>now()+61000;try{assert.equal((await app.inject({method:'GET',url:'/api/health'})).status,200);}finally{Date.now=now;}
}));
test('AU11 requester notification metrics never expose another user mock-delivery count',()=>fixture(async app=>{
 const employee=await login(app),customer=await login(app,'rahim.chowdhury@client.upstra.local');
 assert.equal((await app.inject({method:'POST',url:'/api/tickets',token:employee,body:{title:'Outlook private notification audit',description:'Synthetic Outlook TLS request creates one mock notification',serviceCategoryId:'cat-outlook-config', customFormPayload: { osPlatform: 'macOS' }}})).status,201);
 const own=await app.inject({method:'GET',url:'/api/notifications',token:customer});assert.equal(own.data.items.length,0);assert.equal(own.data.deliveredTransportCount,0);
}));
test('API mutation negatives reject missing fields, bad notes and unauthorized ownership',()=>fixture(async app=>{
 const employee=await login(app),other=await login(app,'nadia.islam@upstra.local'),it=await login(app,'kamal.hossain@upstra.local');const ticket=app.store.getState().tickets.find(t=>t.requesterId==='user-emp-tawsif')!;
 const post=(token:string,sub:string,body:Record<string,unknown>)=>app.inject({method:'POST',url:`/api/tickets/${ticket.id}/${sub}`,token,body});
 assert.equal((await post(employee,'transition',{})).status,400);assert.equal((await post(employee,'transition',{status:'UNKNOWN'})).status,403);
 assert.equal((await post(employee,'comments',{body:''})).status,400);assert.equal((await post(employee,'comments',{body:'x'.repeat(2001)})).status,400);assert.equal((await post(other,'comments',{body:'Forbidden foreign update'})).status,403);
 assert.equal((await post(it,'escalate-cto',{})).status,400);assert.equal(app.store.getState().tickets.find(t=>t.id===ticket.id)!.status,ticket.status);
 const approval=app.store.getState().approvals.find(a=>a.requiredRole==='IT_ADMIN')!;assert.equal((await app.inject({method:'POST',url:`/api/approvals/${approval.id}/decide`,token:it,body:{decision:'UNKNOWN',decisionNotes:'Synthetic invalid decision'}})).status,400);
}));
test('approval cannot enable real AD/mail writes and unsafe transport mode stays rejected',()=>fixture(async(app,file)=>{
 const {MockActiveDirectoryAdapter,UnconfiguredMailboxProvisioningAdapter}=await import('../packages/connectors/src/index.ts');
 const ad=new MockActiveDirectoryAdapter();const result=await ad.proposeWriteAction({actionType:'CREATE_USER',targetIdentifier:'fixture-only',requestedByEmail:'fixture@example.test',approvalId:'synthetic-approval',approvedByRole:'CTO',dryRun:false,parameters:{}});assert.equal(result.executed,false);assert.equal(result.dryRun,true);
 const mail=await new UnconfiguredMailboxProvisioningAdapter().requestMailboxCreation({requestedAddress:'fixture@example.test',displayName:'Fixture',sbuCode:'SBU-TECH',approvalId:'synthetic-approval'});assert.equal(mail.provisioned,false);
 const provider=process.env.MAIL_PROVIDER;try{process.env.MAIL_PROVIDER='mailpit';assert.throws(()=>createApiServer(file),/JSON_MODE_REQUIRES_MOCK_MAIL/);}finally{if(provider===undefined)delete process.env.MAIL_PROVIDER;else process.env.MAIL_PROVIDER=provider;}
}));
