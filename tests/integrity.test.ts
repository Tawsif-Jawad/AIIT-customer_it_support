import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {EnterpriseDataStore,createInitialSeedState,validateDatabaseState} from '../apps/api/src/store.ts';
import {runVerification} from '../scripts/verify-local.ts';

test('partial temporary write preserves original bytes and recovers memory',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiit-partial-'));const file=path.join(dir,'db.json');
 const store=new EnterpriseDataStore(file);const original=fs.readFileSync(file,'utf8');const write=fs.writeFileSync;
 try {
  store.getState().tickets[0].title='must never commit';
  fs.writeFileSync=((target:fs.PathOrFileDescriptor,data:string|NodeJS.ArrayBufferView,...args:unknown[])=>{
   if(typeof data==='string'&&data.startsWith('{\n')) {write(target,data.slice(0,25));throw new Error('interrupted temporary write');}
   return (write as Function)(target,data,...args);
  }) as typeof fs.writeFileSync;
  assert.throws(()=>store.persist(),/interrupted/);
  assert.equal(fs.readFileSync(file,'utf8'),original);assert.deepEqual(store.getState(),JSON.parse(original));
 } finally {fs.writeFileSync=write;fs.rmSync(dir,{recursive:true,force:true});}
});
test('killed transaction leaves source intact and fails closed until controlled recovery',{timeout:10000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiit-crash-'));const file=path.join(dir,'db.json');new EnterpriseDataStore(file);
 const raw=fs.readFileSync(file,'utf8');const module=new URL('../apps/api/src/store.ts',import.meta.url).href;
 const child=spawn(process.execPath,['--input-type=module','-e',`import {EnterpriseDataStore} from ${JSON.stringify(module)};const s=new EnterpriseDataStore(${JSON.stringify(file)});setInterval(()=>{},1000);await s.transaction(async()=>{s.getState().tickets[0].title='uncommitted';console.log('READY');await new Promise(()=>{});return true;});`],{stdio:['ignore','pipe','pipe']});
 try {
  await new Promise<void>((resolve,reject)=>{child.stdout.on('data',()=>resolve());child.on('error',reject);child.on('exit',()=>reject(new Error('Writer exited before synchronization')));});
  const stopped=new Promise(resolve=>child.on('close',resolve));child.kill('SIGKILL');await stopped;
  assert.equal(fs.readFileSync(file,'utf8'),raw);assert.equal(fs.existsSync(file+'.lock'),true);
  assert.throws(()=>new EnterpriseDataStore(file).persist(),/PERSISTENCE_BUSY/);
  // Child termination is awaited above. Removal is scoped to this fixture only.
  fs.unlinkSync(file+'.lock');assert.deepEqual(new EnterpriseDataStore(file).getState(),JSON.parse(raw));
 } finally {child.kill('SIGKILL');fs.rmSync(dir,{recursive:true,force:true});}
});
test('complete record types, duplicate natural keys and historical references are validated',()=>{
 const mutations=[
  (s:ReturnType<typeof createInitialSeedState>)=>{s.tickets[0].aiConfidence=2;},
  (s:ReturnType<typeof createInitialSeedState>)=>{s.users[0].isActive='yes' as unknown as boolean;},
  (s:ReturnType<typeof createInitialSeedState>)=>{s.assets[0].serialNumber=s.assets[1].serialNumber;},
  (s:ReturnType<typeof createInitialSeedState>)=>{s.approvals[0].requestedById='orphan';},
  (s:ReturnType<typeof createInitialSeedState>)=>{s.ticketEvents[0].actorId='orphan';},
  (s:ReturnType<typeof createInitialSeedState>)=>{s.notifications.push({id:'orphan-notification',ticketId:null,recipientId:'orphan',recipientEmail:'fixture@example.test',channel:'EMAIL_AND_IN_APP',subject:'Fixture',body:'Fixture',status:'QUEUED',errorDetails:null,readAt:null,sentAt:null,createdAt:new Date().toISOString()});},
  (s:ReturnType<typeof createInitialSeedState>)=>{s.knowledgeArticles[0].tags='invalid' as unknown as string[];},
 ];
 for(const change of mutations){const source=createInitialSeedState();change(source);assert.throws(()=>validateDatabaseState(source),/PERSISTENCE_INVALID/);}
});
test('backup restoration preserves all collection counts, references and exact source checksum',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiit-restore-'));const file=path.join(dir,'source.json');
 try {
  new EnterpriseDataStore(file);const backup=path.join(dir,'backup.json');fs.copyFileSync(file,backup);
  const hash=(p:string)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const report=JSON.parse(execFileSync(process.execPath,['scripts/validate-json-migration.ts',backup],{encoding:'utf8'}));assert.equal(report.sha256,hash(file));
  const restored=path.join(dir,'restored.json');fs.copyFileSync(backup,restored);
  assert.deepEqual(new EnterpriseDataStore(restored).getState(),new EnterpriseDataStore(file).getState());assert.equal(hash(file),hash(restored));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('local verifier reports child startup failures and never overwrites existing evidence',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiit-verifier-fault-'));
 const evidence=path.join(root,'results');const previous=process.env.PATH;
 try {
  // Fault fixture only: removing npm from PATH must cause a real nonzero result,
  // not an always-green summary. This is not evidence of application checks.
  process.env.PATH='';
  const result=await runVerification(evidence);
  assert.equal(result.exitCode,1);
  const summary=JSON.parse(fs.readFileSync(path.join(evidence,'summary.json'),'utf8'));
  assert.equal(summary.results.length,10);
  assert.ok(summary.results.every((row:{exitCode:number})=>row.exitCode!==0));
  assert.equal(summary.hostedCiPassed,false);assert.equal(summary.preservation.operationalUnchanged,true);
  const original=fs.readFileSync(path.join(evidence,'summary.json'),'utf8');
  await assert.rejects(runVerification(evidence),/EEXIST/);
  assert.equal(fs.readFileSync(path.join(evidence,'summary.json'),'utf8'),original);
 }finally{
  if(previous===undefined)delete process.env.PATH;else process.env.PATH=previous;
  fs.rmSync(root,{recursive:true,force:true});
 }
});
