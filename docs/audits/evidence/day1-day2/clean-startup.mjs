// Clean, disposable copy of current source; no .env, .data or Git credentials copied.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';import {spawn,spawnSync,execFileSync} from 'node:child_process';
const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'aiit-clean-audit-'));
const files=new Set([...execFileSync('git',['ls-files'],{encoding:'utf8'}).trim().split('\n'),...execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n')]);
for(const file of files)if(/^(apps|packages|scripts|tests)\//.test(file)||['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','eslint.config.mjs','playwright.config.ts','.node-version'].includes(file)){const to=path.join(temp,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,file),to);}
const env={...process.env,NODE_ENV:'development',AUTH_MODE:'dev_oidc',MAIL_PROVIDER:'mock',DATABASE_URL:'postgresql://aiit_test@127.0.0.1:1/aiit_test'};
const commands=[],children=[];let api,web;
function run(args){const r=spawnSync('npm',['exec','--yes','--package=pnpm@9.15.0','--','pnpm',...args],{cwd:temp,env,encoding:'utf8'});commands.push({command:'pnpm@9.15.0 '+args.join(' '),exit:r.status});if(r.status!==0)throw new Error('Clean prerequisite failed: '+args[0]);}
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
function start(entry,vars){const child=spawn(process.execPath,[entry],{cwd:temp,env:{...env,...vars},stdio:'ignore'});children.push(child);return child;}
async function stop(child){if(child.exitCode!==null||child.signalCode)return;const done=new Promise(r=>child.once('close',r));child.kill('SIGTERM');await done;}
async function ready(url){for(let i=0;i<40;i++){try{const r=await fetch(url);if(r.status===200)return r;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('Disposable server did not become ready');}
try{
 run(['install','--offline','--frozen-lockfile','--ignore-scripts']);run(['db:generate']);run(['typecheck']);
 const apiPort=await port(),webPort=await port();api=start('apps/api/src/main.ts',{API_PORT:String(apiPort)});await ready(`http://127.0.0.1:${apiPort}/api/health`);
 web=start('apps/web/src/server.ts',{WEB_PORT:String(webPort),NEXT_PUBLIC_API_URL:`http://127.0.0.1:${apiPort}`});const origin=`http://127.0.0.1:${webPort}`;await ready(origin+'/app');
 const routes=[];for(const route of ['/','/app','/assets/design.css','/assets/portal.js','/assets/public.js','/assets/grain.svg','/assets/atmosphere.svg','/api/health'])routes.push({route,status:(await fetch(origin+route)).status});
 const auth=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'tawsif.zawad@upstra.com'})});const token=(await auth.json()).token;if(auth.status!==200||!token)throw new Error('Synthetic login failed');
 await stop(api);api=start('apps/api/src/main.ts',{API_PORT:String(apiPort)});await ready(`http://127.0.0.1:${apiPort}/api/health`);
 const after=await fetch(origin+'/api/auth/me',{headers:{authorization:'Bearer '+token}});if(after.status!==200)throw new Error('Session failed after API restart');
 console.log(JSON.stringify({scope:'clean copy without operational/configuration files',node:process.version,commands,routes,loginStatus:auth.status,sessionAfterRestart:after.status,realPostgresRuntime:false,mocksOnly:true,shutdown:'SIGTERM awaited; children and temporary source removed'}));
}finally{for(const child of children)await stop(child);fs.rmSync(temp,{recursive:true,force:true});}
