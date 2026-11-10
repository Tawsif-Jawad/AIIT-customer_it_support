import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {createInitialSeedState} from '../apps/api/src/store.ts';

// An externally provided URL is never used by these tests. Always create a new
// cluster and database under mkdtemp, isolated from corporate/operational data.
test('PostgreSQL migrations preserve IDs, match Prisma, import idempotently and roll back conflicts',{timeout:180000},async t=>{
 let bindir=process.env.PG_BINDIR || '';
 if(!bindir) try {bindir=path.dirname(execFileSync('which',['initdb'],{encoding:'utf8'}).trim());} catch { /* unavailable binary is reported below */ }
 if(!fs.existsSync(path.join(bindir,'initdb'))) {
  if(process.env.DB_REQUIRED==='true') throw new Error('Disposable PostgreSQL binaries required');
  t.skip('PostgreSQL initdb unavailable; use DB_REQUIRED=true to require this gate');return;
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiit-pg-'));const data=path.join(dir,'cluster');
 const listener=net.createServer();await new Promise<void>(r=>listener.listen(0,'127.0.0.1',r));const port=(listener.address() as net.AddressInfo).port;await new Promise<void>(r=>listener.close(()=>r()));
 const pg=(cmd:string,args:string[])=>execFileSync(path.join(bindir,cmd),args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 let started=false;
 try {
  pg('initdb',['-D',data,'-U','aiit_test','-A','trust','--no-locale','-E','UTF8']);
  pg('pg_ctl',['-D',data,'-l',path.join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${dir}`,'-w','start']);started=true;
  pg('createdb',['-h','127.0.0.1','-p',String(port),'-U','aiit_test','aiit_test']);
  const url=`postgresql://aiit_test@127.0.0.1:${port}/aiit_test`;
  const env={...process.env,DATABASE_URL:url};
  execFileSync('node_modules/.bin/prisma',['migrate','deploy','--schema','apps/api/prisma/schema.prisma'],{env,encoding:'utf8'});
  const {PrismaClient}=await import('@prisma/client');const {importJsonSnapshot,verifyImportedSnapshot}=await import('../scripts/json-import.ts');
  const client=new PrismaClient({datasources:{db:{url}}});
  try {
   const source=createInitialSeedState();source.authSessions=[{id:'b'.repeat(64),userId:source.users[0].id,expiresAt:Date.now()+60000}];
   source.users[0].oidcIssuer='https://synthetic-issuer.example.test/realm';
   source.authSessions.push({id:'c'.repeat(64),userId:source.users[0].id,expiresAt:Date.now()+60000,kind:'oidc',issuer:source.users[0].oidcIssuer,subject:source.users[0].oidcSubject});
   // Nonempty historical fixtures prove comments/attachments/notifications are
   // preserved, rather than merely comparing empty collection counts.
   source.ticketComments.push({id:'imported-comment',ticketId:source.tickets[0].id,authorId:source.users[0].id,authorName:'Synthetic historical author',authorRole:'EMPLOYEE',body:'Synthetic historical comment',isInternal:false,attachments:[{fileName:'fixture.txt',mimeType:'text/plain',sizeBytes:42}],createdAt:'2026-11-09T18:00:00+06:00'});
   source.notifications.push({id:'imported-notification',ticketId:source.tickets[0].id,recipientId:source.users[0].id,recipientEmail:'fixture@example.test',channel:'IN_APP_ONLY',subject:'Synthetic historical notification',body:'Preserve without replay',status:'SENT',errorDetails:null,readAt:null,sentAt:'2026-11-09T12:00:00Z',createdAt:'2026-11-09T12:00:00Z'});
   source.approvals[1]={...source.approvals[1],status:'APPROVED',approverId:'user-cto-farhana',decisionNotes:'Synthetic historical decision',decidedAt:'2026-11-09T12:00:00Z'};
   const counts=await importJsonSnapshot(client,source);
   assert.equal(await client.notificationJob.count(),0,'Import must not enqueue historical delivery');
   assert.equal(counts.tickets,source.tickets.length);
   const delegates=['sBU','role','user','serviceCategory','ticket','ticketEvent','ticketComment','asset','approval','notification','aIActionLog','auditLog','knowledgeArticle','authSession'] as const;
   const expected=[source.sbus,source.roles,source.users,source.serviceCategories,source.tickets,source.ticketEvents,source.ticketComments,source.assets,source.approvals,source.notifications,source.aiActionLogs,source.auditLogs,source.knowledgeArticles,source.authSessions];
   for(let i=0;i<delegates.length;i++) assert.equal(await (client[delegates[i]] as {count():Promise<number>}).count(),expected[i].length,delegates[i]);
   assert.equal((await client.ticket.findFirstOrThrow()).id.startsWith('ticket-'),true);
   assert.deepEqual(await importJsonSnapshot(client,source),counts);
   assert.equal(await client.ticket.count(),source.tickets.length);
   await Promise.all([importJsonSnapshot(client,source),importJsonSnapshot(client,source)]);
   const manifest=await verifyImportedSnapshot(client,source);assert.equal(manifest.tickets.count,source.tickets.length);
   const invalidScope=structuredClone(source);invalidScope.tickets[0].sbuId='sbu-fin-002';
   await assert.rejects(importJsonSnapshot(client,invalidScope),/SBU mismatch/);
   const lateConflict=structuredClone(source);lateConflict.sbus.push({...source.sbus[0],id:'late-rollback',code:'LATE-ROLLBACK'});lateConflict.tickets[0].title='Changed synthetic title';
   await assert.rejects(importJsonSnapshot(client,lateConflict),/IMPORT_CONFLICT/);
   assert.equal(await client.sBU.count({where:{id:'late-rollback'}}),0);
   await assert.rejects(verifyImportedSnapshot(client,lateConflict),/IMPORT_COUNT_MISMATCH/);
   const checksumMismatch=structuredClone(source);checksumMismatch.tickets[0].title='Changed synthetic title';
   await assert.rejects(verifyImportedSnapshot(client,checksumMismatch),/IMPORT_CHECKSUM_MISMATCH/);
   const changed=structuredClone(source);changed.sbus[0].name='must roll back';
   await assert.rejects(importJsonSnapshot(client,changed),/IMPORT_CONFLICT/);
   assert.equal((await client.sBU.findUniqueOrThrow({where:{id:source.sbus[0].id}})).name,source.sbus[0].name);
   const {customFormPayload: _payload,...duplicate}=await client.ticket.findFirstOrThrow();
   await assert.rejects(client.ticket.create({data:{...duplicate,customFormPayload:{},id:'ticket-duplicate'}}));
   await assert.rejects(client.authSession.create({data:{id:'a'.repeat(64),userId:'missing',expiresAt:new Date()}}));
   await assert.rejects(client.$transaction(async tx=>{await tx.sBU.create({data:{id:'rollback-sbu',code:'ROLLBACK',name:'Temporary'}});throw new Error('rollback');}));
   assert.equal(await client.sBU.count({where:{id:'rollback-sbu'}}),0);
   // Real database backup/restore using only the disposable synthetic fixture.
   const dump=path.join(dir,'backup.sql');pg('pg_dump',['-h','127.0.0.1','-p',String(port),'-U','aiit_test','--no-owner','--file',dump,'aiit_test']);
   pg('createdb',['-h','127.0.0.1','-p',String(port),'-U','aiit_test','aiit_test_restore']);
   pg('psql',['-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(port),'-U','aiit_test','-d','aiit_test_restore','-f',dump]);
   const restored=new PrismaClient({datasources:{db:{url:url+'_restore'}}});
   try {assert.deepEqual(await verifyImportedSnapshot(restored,source),manifest);for(let i=0;i<delegates.length;i++) assert.equal(await (restored[delegates[i]] as {count():Promise<number>}).count(),expected[i].length,'restored '+delegates[i]);} finally {await restored.$disconnect();}
   const {exerciseDay3}=await import('./support/day3-postgres.ts');
   await exerciseDay3(t,client,url);
   const {exerciseDay3Remediation}=await import('./support/day3-remediation.ts');
   await exerciseDay3Remediation(t,client,url);
   // Restore the mutated repository/outbox state too, including leases and versions.
   const fullSnapshot=async (db:InstanceType<typeof PrismaClient>)=>{
    const tables=[...delegates,'notificationJob','ticketCounter'] as const;
    const canonical=(value:unknown)=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
    return Object.fromEntries(await Promise.all(tables.map(async name=>[name,(await (db[name] as {findMany():Promise<unknown[]>}).findMany()).map(canonical).sort()])));
   };
   const committed=await fullSnapshot(client);
   const repositoryDump=path.join(dir,'repository.sql');pg('pg_dump',['-h','127.0.0.1','-p',String(port),'-U','aiit_test','--no-owner','--file',repositoryDump,'aiit_test']);
   pg('createdb',['-h','127.0.0.1','-p',String(port),'-U','aiit_test','aiit_test_repository_restore']);
   pg('psql',['-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(port),'-U','aiit_test','-d','aiit_test_repository_restore','-f',repositoryDump]);
   const repositoryRestored=new PrismaClient({datasources:{db:{url:url+'_repository_restore'}}});
   try {assert.deepEqual(await fullSnapshot(repositoryRestored),committed);const audit=await repositoryRestored.auditLog.findFirstOrThrow();await assert.rejects(repositoryRestored.auditLog.delete({where:{id:audit.id}}));}finally{await repositoryRestored.$disconnect();}
   // Upgrade a populated legacy UUID schema, preserving keys and references.
   pg('createdb',['-h','127.0.0.1','-p',String(port),'-U','aiit_test','aiit_test_upgrade']);
   const upgradeUrl=url+'_upgrade';
   const psqlArgs=['-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(port),'-U','aiit_test','-d','aiit_test_upgrade'];
   pg('psql',[...psqlArgs,'-f','apps/api/prisma/migrations/20261108000000_init/migration.sql']);
   pg('psql',[...psqlArgs,'-c',`INSERT INTO "SBU"(id,code,name) VALUES ('11111111-1111-4111-8111-111111111111','LEGACY','Legacy SBU'); INSERT INTO "Role"(id,name,description,permissions) VALUES ('22222222-2222-4222-8222-222222222222','EMPLOYEE','Legacy','[]'); INSERT INTO "User"(id,email,"displayName","sbuId","roleId") VALUES ('33333333-3333-4333-8333-333333333333','legacy@example.test','Legacy','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');`]);
   execFileSync('node_modules/.bin/prisma',['migrate','resolve','--applied','20261108000000_init','--schema','apps/api/prisma/schema.prisma'],{env:{...env,DATABASE_URL:upgradeUrl},encoding:'utf8'});
   execFileSync('node_modules/.bin/prisma',['migrate','deploy','--schema','apps/api/prisma/schema.prisma'],{env:{...env,DATABASE_URL:upgradeUrl},encoding:'utf8'});
   const upgrade=new PrismaClient({datasources:{db:{url:upgradeUrl}}});
   try {const user=await upgrade.user.findUniqueOrThrow({where:{id:'33333333-3333-4333-8333-333333333333'}});assert.equal(user.sbuId,'11111111-1111-4111-8111-111111111111');assert.equal(await upgrade.sBU.count(),1);} finally {await upgrade.$disconnect();}
   const diff=execFileSync('node_modules/.bin/prisma',['migrate','diff','--from-url',url,'--to-schema-datamodel','apps/api/prisma/schema.prisma','--exit-code'],{env,encoding:'utf8'});
   assert.match(diff,/No difference detected|empty/i);
   t.diagnostic('DAY3_DATABASE_EVIDENCE '+JSON.stringify({postgres:pg('postgres',['--version']).trim(),migrationCount:fs.readdirSync('apps/api/prisma/migrations',{withFileTypes:true}).filter(item=>item.isDirectory()).length,sourceManifest:manifest,concurrentIdenticalImports:2,sourceRestoreChecksumMatch:true,repositoryRestoreMatch:true,prismaSchemaParity:true,populatedUuidUpgrade:true,operationalTargetUsed:false}));
  } finally {await client.$disconnect();}
 } finally {if(started) pg('pg_ctl',['-D',data,'-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
});
