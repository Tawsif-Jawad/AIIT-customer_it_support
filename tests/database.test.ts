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
  const {PrismaClient}=await import('@prisma/client');const {importJsonSnapshot}=await import('../scripts/json-import.ts');
  const client=new PrismaClient({datasources:{db:{url}}});
  try {
   const source=createInitialSeedState();source.authSessions=[{id:'b'.repeat(64),userId:source.users[0].id,expiresAt:Date.now()+60000}];
   const counts=await importJsonSnapshot(client,source);
   assert.equal(counts.tickets,source.tickets.length);
   const delegates=['sBU','role','user','serviceCategory','ticket','ticketEvent','ticketComment','asset','approval','notification','aIActionLog','auditLog','knowledgeArticle','authSession'] as const;
   const expected=[source.sbus,source.roles,source.users,source.serviceCategories,source.tickets,source.ticketEvents,source.ticketComments,source.assets,source.approvals,source.notifications,source.aiActionLogs,source.auditLogs,source.knowledgeArticles,source.authSessions];
   for(let i=0;i<delegates.length;i++) assert.equal(await (client[delegates[i]] as {count():Promise<number>}).count(),expected[i].length,delegates[i]);
   assert.equal((await client.ticket.findFirstOrThrow()).id.startsWith('ticket-'),true);
   assert.deepEqual(await importJsonSnapshot(client,source),counts);
   assert.equal(await client.ticket.count(),source.tickets.length);
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
   try {for(let i=0;i<delegates.length;i++) assert.equal(await (restored[delegates[i]] as {count():Promise<number>}).count(),expected[i].length,'restored '+delegates[i]);} finally {await restored.$disconnect();}
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
  } finally {await client.$disconnect();}
 } finally {if(started) pg('pg_ctl',['-D',data,'-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
});
