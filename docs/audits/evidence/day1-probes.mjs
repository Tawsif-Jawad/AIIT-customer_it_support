// Audit-only harness. Every mutation uses mkdtemp storage; never the workspace dataset.
// Run from repository root: NODE_ENV=test AUTH_MODE=dev_oidc MAIL_PROVIDER=mock node docs/audits/evidence/day1-probes.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApiServer} from '../../../apps/api/src/app.ts';
import {EnterpriseDataStore} from '../../../apps/api/src/store.ts';
import {DevelopmentEmailTransport} from '../../../packages/connectors/src/index.ts';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiit-day1-probes-'));
const observations=[];
const record=(id,expected,observed,conforms)=>observations.push({id,secureOrFunctionalExpectation:expected,observed,conforms});
try {
 const db=path.join(dir,'api.json');const app=createApiServer(db);const state=app.store.getState();
 const users=Object.fromEntries(['EMPLOYEE','CUSTOMER','IT_ADMIN','CTO'].map(role=>[role,state.users.find(u=>u.roleName===role)]));
 const tokens={};for(const [role,u] of Object.entries(users)){const r=await app.inject({method:'POST',url:'/api/auth/login',body:{email:u.email}});tokens[role]=r.data.token;}
 const request=(method,url,role='EMPLOYEE',body)=>app.inject({method,url,token:tokens[role],body});
 record('P01','Unauthenticated ticket access rejected',(await app.inject({method:'GET',url:'/api/tickets'})).status,(await app.inject({method:'GET',url:'/api/tickets'})).status===401);
 const foreign=state.tickets.find(t=>t.sbuId!==users.EMPLOYEE.sbuId);
 const denied=await request('GET','/api/tickets/'+foreign.id);record('P02','Cross-SBU employee ticket identifier denied',denied.status,denied.status===403);
 for(const route of ['/api/approvals','/api/audit-logs','/api/connectors/ad/lookup']){const r=await request('GET',route,'CUSTOMER');record('P03 '+route,'Customer cannot access privileged route',r.status,r.status===403);}
 const logged=await request('POST','/api/auth/logout');const still=await request('GET','/api/auth/me');record('F03','Logout invalidates the presented bearer session',{logout:logged.status,bearerAfterLogout:still.status},still.status===401);
 const a=state.approvals.find(a=>a.requiredRole==='IT_ADMIN');
 const first=await request('POST','/api/approvals/'+a.id+'/decide','IT_ADMIN',{decision:'APPROVED'});
 const second=await request('POST','/api/approvals/'+a.id+'/decide','IT_ADMIN',{decision:'REJECTED'});
 record('F04','Approval decisions are one-time, require rationale, and reject replay',{first:first.status,replay:second.status,finalStatus:a.status,emptyRationaleAccepted:first.status===200},second.status!==200&&first.status!==200);
 const own=state.tickets.find(t=>t.requesterId===users.EMPLOYEE.id);own.status='ESCALATED_TO_CTO';app.store.persist();
 const close=await request('POST','/api/tickets/'+own.id+'/transition','EMPLOYEE',{status:'CLOSED',notes:'Audit-only policy boundary probe'});
 record('F05','Requester cannot bypass CTO review and close an escalated incident',{status:close.status,result:own.status},close.status!==200);
 const summary=await request('GET','/api/analytics/summary','CUSTOMER');record('F06','Customer summary does not disclose global approval totals',{accessibleTickets:summary.data.totalAccessibleTickets,pendingApprovals:summary.data.pendingApprovals},summary.data.pendingApprovals===0);
 const notes='password=AUDIT_SYNTHETIC_CANARY_NOT_A_REAL_SECRET';own.status='IN_PROGRESS';app.store.persist();
 await request('POST','/api/tickets/'+own.id+'/transition','IT_ADMIN',{status:'RESOLVED_PENDING_CONFIRMATION',notes});
 record('F07','Audit and notification records redact secret-like transition notes',{auditContainsCanary:state.auditLogs.some(a=>JSON.stringify(a.details).includes('AUDIT_SYNTHETIC_CANARY')),notificationContainsCanary:state.notifications.some(n=>n.body.includes('AUDIT_SYNTHETIC_CANARY'))},!state.auditLogs.some(a=>JSON.stringify(a.details).includes('AUDIT_SYNTHETIC_CANARY')));
 const transport=new DevelopmentEmailTransport({mode:'mailpit',smtpHost:'localhost',smtpPort:1,fromAddress:'audit@invalid.example'});
 const delivery=await transport.sendEmail({to:'audit@invalid.example',subject:'Audit-only local transport probe',textBody:'No SMTP message is actually transmitted by this adapter.'});
 record('F08','Mailpit delivery is not marked successful when only a failed TCP attempt occurs',{reportedDelivered:delivery.delivered,health:(await transport.getHealth()).status},delivery.delivered===false);
 const base=path.join(dir,'concurrent.json');const one=new EnterpriseDataStore(base),two=new EnterpriseDataStore(base);one.getState().tickets[0].title='AUDIT-WRITER-ONE';one.persist();two.getState().tickets[1].title='AUDIT-WRITER-TWO';two.persist();const reopened=new EnterpriseDataStore(base);
 record('F01','Independent store writers preserve both committed changes',{writerOnePreserved:reopened.getState().tickets.some(t=>t.title==='AUDIT-WRITER-ONE'),writerTwoPreserved:reopened.getState().tickets.some(t=>t.title==='AUDIT-WRITER-TWO')},reopened.getState().tickets.some(t=>t.title==='AUDIT-WRITER-ONE'));
 record('P04','Single-writer records survive store reconstruction',reopened.getState().tickets.some(t=>t.title==='AUDIT-WRITER-TWO'),reopened.getState().tickets.some(t=>t.title==='AUDIT-WRITER-TWO'));
 const snapshot=app.store.getState().tickets.length;const fresh=createApiServer(db);record('P05','API restart/reconstruction reloads ticket and audit data',{sameTicketCount:fresh.store.getState().tickets.length===snapshot,hasAudit:fresh.store.getState().auditLogs.length>0},fresh.store.getState().tickets.length===snapshot);
 const queueApp=createApiServer(path.join(dir,'queue.json'));queueApp.emailTransport.setSimulateFailure(true);await queueApp.queueProcessor.enqueueNotification({ticketId:null,recipientId:queueApp.store.getState().users[0].id,recipientEmail:'audit@invalid.example',subject:'Audit',body:'Synthetic'});queueApp.emailTransport.setSimulateFailure(false);await queueApp.queueProcessor.processPendingJobs();record('F09','Transient notification failure is retried after recovery',queueApp.store.getState().notifications[0].status,queueApp.store.getState().notifications[0].status==='SENT');
 const critical=await request('POST','/api/tickets','EMPLOYEE',{serviceCategoryId:'hardware-incident',title:'Production outage audit fixture',description:'Production down for entire SBU in this synthetic audit scenario.',severity:'LOW'});record('F10','Critical classification cannot be suppressed by caller LOW severity',{status:critical.status,recommended:critical.data.aiDecision?.recommendedSeverity,persisted:critical.data.ticket?.severity},critical.data.ticket?.severity==='CRITICAL');
 const health=await request('GET','/api/health');record('P06','Local integrations are labeled mock/unknown',{status:health.data.status,oidc:health.data.components.keycloakOidc.status},health.data.status==='MOCK MODE');
 const ad=await app.adAdapter.proposeWriteAction({actionType:'ADD_GROUP_MEMBER',targetIdentifier:'AUDIT_FIXTURE',requestedByEmail:'audit@invalid.example',dryRun:false,parameters:{},approvalId:'audit-only',approvedByRole:'CTO'});const mail=await app.mailboxProvisioner.requestMailboxCreation({requestedAddress:'audit@invalid.example',displayName:'Audit',sbuCode:'DEMO'});record('P07','Approved-looking mock requests never execute real AD/mail writes',{adExecuted:ad.executed,adStatus:ad.status,mailProvisioned:mail.provisioned},!ad.executed&&!mail.provisioned);
 const asset=state.assets.find(a=>a.assignedUserId===users.EMPLOYEE.id);const assets=await request('GET','/api/assets');const ack=await request('POST','/api/assets/'+asset.id+'/acknowledge');record('P09','Assigned user can list and acknowledge an owned fixture asset',{listed:assets.data.items.some(a=>a.id===asset.id),ack:ack.status,status:asset.handoverAckStatus},ack.status===200&&asset.handoverAckStatus==='ACKNOWLEDGED');
 const article=state.knowledgeArticles[0];article.isApproved=false;const kb=await request('GET','/api/kb');record('P10','Unapproved knowledge is not returned by the KB API',kb.data.items.some(k=>k.id===article.id),!kb.data.items.some(k=>k.id===article.id));
 await request('POST','/api/tickets/'+own.id+'/comments','IT_ADMIN',{body:'Audit-only internal fixture note',isInternal:true});const visible=await request('GET','/api/tickets/'+own.id);record('P11','Internal ticket notes are excluded from requester detail',visible.data.comments.some(c=>c.isInternal),!visible.data.comments.some(c=>c.isInternal));
 const old=process.env.NODE_ENV;process.env.NODE_ENV='production';const prodLogin=await app.inject({method:'POST',url:'/api/auth/login',body:{email:users.EMPLOYEE.email}});const prodMe=await request('GET','/api/auth/me');process.env.NODE_ENV=old;record('P08','Production rejects development login and tokens',{login:prodLogin.status,me:prodMe.status},prodLogin.status===503&&prodMe.status===401);
 fs.writeFileSync(new URL('./probe-results.json',import.meta.url),JSON.stringify({environment:'isolated temporary fixtures; NODE_ENV=test, AUTH_MODE=dev_oidc, MAIL_PROVIDER=mock',observations},null,2)+'\n');
 console.log(JSON.stringify(observations,null,2));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
