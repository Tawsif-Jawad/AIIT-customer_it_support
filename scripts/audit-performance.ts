/** Synthetic, isolated request timing and replacement count; not a load benchmark. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {performance} from 'node:perf_hooks';
import {createApiServer} from '../apps/api/src/app.ts';
process.env.NODE_ENV='test';process.env.AUTH_MODE='dev_oidc';process.env.MAIL_PROVIDER='mock';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiit-perf-'));const app=createApiServer(path.join(dir,'db.json'));
try{
 const token=(await app.inject({method:'POST',url:'/api/auth/login',body:{email:'tawsif.zawad@upstra.com'}})).data.token;
 const rename=fs.renameSync;let replacements=0;fs.renameSync=((...args:Parameters<typeof fs.renameSync>)=>{replacements++;return rename(...args);}) as typeof fs.renameSync;
 const times:number[]=[];
 try{for(let i=0;i<100;i++){const start=performance.now();const r=await app.inject({method:'GET',url:'/api/tickets',token});if(r.status!==200)throw new Error('Probe failed');times.push(performance.now()-start);}}finally{fs.renameSync=rename;}
 times.sort((a,b)=>a-b);console.log(JSON.stringify({scope:'100 sequential injected GETs on synthetic seed; no network',samples:times.length,fileReplacements:replacements,medianMs:times[50],p95Ms:times[94]}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
