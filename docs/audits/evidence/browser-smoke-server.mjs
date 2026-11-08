// Audit-only isolated server. Never opens the workspace data file. Ctrl-C removes fixtures.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApiServer} from '../../../apps/api/src/app.ts';
import {createWebServer} from '../../../apps/web/src/server.ts';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiit-day1-browser-'));
const app=createApiServer(path.join(dir,'fixtures.json'));
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const web=createWebServer('http://127.0.0.1:'+app.server.address().port);
await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));
console.log(JSON.stringify({url:'http://127.0.0.1:'+web.address().port,mode:'ISOLATED_DISPOSABLE_MOCK_FIXTURES'}));
async function stop(){await new Promise(resolve=>web.close(resolve));await new Promise(resolve=>app.server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
