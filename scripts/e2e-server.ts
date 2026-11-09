/** Disposable loopback browser-test harness. Never loads .env or operational data. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApiServer} from '../apps/api/src/app.ts';
import {createWebServer} from '../apps/web/src/server.ts';
process.env.NODE_ENV='test';process.env.AUTH_MODE='dev_oidc';process.env.MAIL_PROVIDER='mock';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiit-e2e-'));
const app=createApiServer(path.join(dir,'db.json'));
await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const web=createWebServer(`http://127.0.0.1:${(app.server.address() as {port:number}).port}`);
web.listen(4173,'127.0.0.1');
let closing=false;
async function close(){if(closing)return;closing=true;await new Promise<void>(r=>web.close(()=>r()));await new Promise<void>(r=>app.server.close(()=>r()));fs.rmSync(dir,{recursive:true,force:true});}
process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());
