// Only ephemeral loopback servers and a synthetic mkdtemp dataset.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createApiServer} from '../../../apps/api/src/app.ts';
import {createWebServer} from '../../../apps/web/src/server.ts';
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'aiit-day2-http-'));
const app = createApiServer(path.join(dir,'db.json'));
let web;
try {
  await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve));
  const target = `http://127.0.0.1:${app.server.address().port}`;
  web = createWebServer(target);
  await new Promise(resolve => web.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${web.address().port}`;
  const statuses = [];
  for(const route of ['/','/app','/api/health']) { const r = await fetch(origin+route); assert.equal(r.status,200); await r.text(); statuses.push([route,r.status]); }
  const login = await fetch(origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'tawsif.zawad@upstra.com'})});
  assert.equal(login.status,200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  await login.json();
  assert.equal((await fetch(origin+'/api/auth/me',{headers:{cookie,origin}})).status,200);
  const parallel = await Promise.all(Array.from({length:6},(_,i) => fetch(origin+'/api/tickets',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({serviceCategoryId:'cat-outlook-config',title:`HTTP Outlook request ${i}`,description:'Help with secure Outlook configuration on a laptop'})})));
  assert.ok(parallel.every(r=>r.status===201));
  await Promise.all(parallel.map(r=>r.json()));
  assert.equal((await fetch(origin+'/api/auth/logout',{method:'POST',headers:{cookie,origin}})).status,200);
  assert.equal((await fetch(origin+'/api/auth/me',{headers:{cookie}})).status,401);
  console.log(JSON.stringify({result:'PASS',statuses,parallelCreates:6,cookieReplayAfterLogout:401,browserVisualInspection:false}));
} finally {
  if(web) await new Promise(resolve=>web.close(resolve));
  await new Promise(resolve=>app.server.close(resolve));
  fs.rmSync(dir,{recursive:true,force:true});
}
