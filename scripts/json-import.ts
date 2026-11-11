/** Explicit non-destructive source -> isolated database import. No default target. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {validateDatabaseState,type DatabaseState} from '../apps/api/src/store.ts';
export const mapping=[['sbus','sBU'],['roles','role'],['users','user'],['serviceCategories','serviceCategory'],['tickets','ticket'],['ticketEvents','ticketEvent'],['ticketComments','ticketComment'],['assets','asset'],['approvals','approval'],['notifications','notification'],['aiActionLogs','aIActionLog'],['auditLogs','auditLog'],['knowledgeArticles','knowledgeArticle'],['authSessions','authSession']] as const;
function validateImportSource(source:DatabaseState):void {
 validateDatabaseState(source);
 for(const ticket of source.tickets) if(!source.users.some(u=>u.id===ticket.requesterId&&u.sbuId===ticket.sbuId)) throw new Error('PERSISTENCE_INVALID: Ticket requester SBU mismatch');
 for(const asset of source.assets) if(asset.assignedUserId&&!source.users.some(u=>u.id===asset.assignedUserId&&u.sbuId===asset.sbuId)) throw new Error('PERSISTENCE_INVALID: Asset custodian SBU mismatch');
 const subjects=source.users.map(u=>u.oidcSubject);
 if(new Set(subjects).size!==subjects.length) throw new Error('PERSISTENCE_INVALID: Duplicate users.oidcSubject');
}
// Runtime display context is retained in historical rows; user role/SBU labels
// are derived from foreign keys in PostgreSQL, not discarded historical events.
export async function importJsonSnapshot(client:PrismaClient,source:DatabaseState) {
 validateImportSource(source);
 return client.$transaction(async tx=>{
  // Serialize repeat imports across independent processes without overwriting rows.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(611102026)`;
  const counts:Record<string,number>={};
  for(const [collection,model] of mapping) {
   const delegate=(tx as unknown as Record<string,{findUnique(args:unknown):Promise<unknown>;create(args:unknown):Promise<unknown>}>)[model];
   const rows=source[collection] || [];counts[collection]=rows.length;
   for(const row of rows) {
    const data={...row} as Record<string,unknown>;
    if(collection==='users') {delete data.roleName;delete data.sbuCode;}
    for(const key of Object.keys(data)) {
     if(key.endsWith('At')&&data[key]!==null) data[key]=new Date(data[key] as string|number);
    }
    if(collection==='authSessions') data.expiresAt=new Date((row as {expiresAt:number}).expiresAt);
    const existing=await delegate.findUnique({where:{id:data.id}});
    if(existing) {
     const normalize=(value:unknown):string=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
     const projected=Object.fromEntries(Object.keys(data).map(key=>[key,(existing as Record<string,unknown>)[key]]));
     if(normalize(projected)!==normalize(data)) throw new Error('IMPORT_CONFLICT: Existing record differs; no overwrite allowed');
    } else await delegate.create({data});
   }
  }
  if (source.ticketNumberHighWatermark !== undefined) {
   await tx.$executeRaw`
    INSERT INTO "TicketCounter" (id, value) VALUES ('tickets', ${source.ticketNumberHighWatermark}::integer)
    ON CONFLICT (id) DO UPDATE SET value = GREATEST("TicketCounter".value, EXCLUDED.value)
   `;
  }
  return counts;
 },{timeout:60000});
}
/** Exact source-field projection: UTC dates, derived user labels and DB defaults documented. */
export async function verifyImportedSnapshot(client:PrismaClient,source:DatabaseState) {
 validateImportSource(source);
 return client.$transaction(async tx=>{
  const results:Record<string,{count:number;checksum:string}>={};
  const canonical=(value:unknown)=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
  const checksum=(rows:unknown[])=>crypto.createHash('sha256').update(canonical(rows.map(canonical).sort())).digest('hex');
  for(const [collection,model] of mapping) {
   const delegate=(tx as unknown as Record<string,{findMany():Promise<Record<string,unknown>[]>}>)[model];
   const target=await delegate.findMany();const rows=source[collection]||[];
   if(target.length!==rows.length) throw new Error('IMPORT_COUNT_MISMATCH: '+collection);
   const expected:unknown[]=[];const actual:unknown[]=[];
   for(const row of rows) {
    const data={...row} as Record<string,unknown>;
    if(collection==='users') {delete data.roleName;delete data.sbuCode;}
    for(const key of Object.keys(data)) if(key.endsWith('At')&&data[key]!==null) data[key]=new Date(data[key] as string|number).toISOString();
    const found=target.find(item=>item.id===data.id);
    if(!found) throw new Error('IMPORT_REFERENCE_MISMATCH: '+collection);
    expected.push(data);actual.push(Object.fromEntries(Object.keys(data).map(key=>[key,found[key]])));
   }
   if(checksum(expected)!==checksum(actual)) throw new Error('IMPORT_CHECKSUM_MISMATCH: '+collection);
   results[collection]={count:rows.length,checksum:checksum(actual)};
  }
  return results;
 },{isolationLevel:'RepeatableRead',timeout:60000});
}
if(import.meta.url===new URL(process.argv[1]||'', 'file:').href) {
 const [source,target]=process.argv.slice(2);
 if(!source||!target||process.env.AIIT_IMPORT_DISPOSABLE!=='true') throw new Error('Explicit SOURCE TARGET_URL and AIIT_IMPORT_DISPOSABLE=true required; never use operational targets');
 const url=new URL(target);
 if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.startsWith('/aiit_test')) throw new Error('Importer CLI only accepts loopback aiit_test databases');
 const raw=fs.readFileSync(source);const client=new PrismaClient({datasources:{db:{url:target}}});
 try {console.log(JSON.stringify({counts:await importJsonSnapshot(client,JSON.parse(raw.toString())),sourceSha256:crypto.createHash('sha256').update(raw).digest('hex')}));} finally {await client.$disconnect();}
}
