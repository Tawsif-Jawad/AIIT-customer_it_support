import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createWebServer,getPortalHtml} from '../apps/web/src/server.ts';
import {getLandingHtml} from '../apps/web/src/landing.ts';

test('public presentation, application and allowlisted assets are served separately',async()=>{
  const server=createWebServer('http://127.0.0.1:9');
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address() as {port:number};
  const base='http://127.0.0.1:'+address.port;
  try{
    const landing=await fetch(base+'/');assert.equal(landing.status,200);const html=await landing.text();assert.match(html,/dot-wordmark/);assert.match(html,/Illustrative workflow/);assert.doesNotMatch(html,/login-email-input/);
    const app=await fetch(base+'/app');assert.match(await app.text(),/login-email-input/);
    for(const asset of ['design.css','public.js','portal.js','grain.svg','atmosphere.svg']){const res=await fetch(base+'/assets/'+asset);assert.equal(res.status,200);assert.equal(res.headers.get('x-content-type-options'),'nosniff');}
    assert.equal((await fetch(base+'/assets/unknown.js')).status,404);
    assert.equal((await fetch(base+'/missing')).status,404);
    const unavailable=await fetch(base+'/api/health');assert.equal(unavailable.status,502);assert.equal((await unavailable.json()).error.code,'BAD_GATEWAY');
  }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

test('browser scripts and landing markup maintain original signature and safe demo labels',()=>{
  for(const file of ['public.js','portal.js'])new vm.Script(fs.readFileSync(new URL('../apps/web/public/'+file,import.meta.url),'utf8'));
  const html=getLandingHtml();assert.match(html,/aria-label="AIIT — Artificial Intelligence/);assert.match(html,/data-year/);assert.match(html,/href="\/app"/);assert.doesNotMatch(html,/omnistra\.io/);
});

test('a response from an earlier session cannot populate the next user workspace',async()=>{
  let complete:(value:any)=>void=()=>{};
  const pending=new Promise(resolve=>complete=resolve);
  const context=vm.createContext({document:{getElementById:()=>({}),querySelectorAll:()=>[]},localStorage:{getItem:()=> 'old-token',removeItem:()=>{}},fetch:()=>pending,AbortController,setTimeout,clearTimeout});
  const script=getPortalHtml().match(/<script>([\s\S]*?)<\/script>/)![1].replace("initAuth().catch(error => showFeedback(error.message, 'error'));",'');
  vm.runInContext(script,context);
  const request=vm.runInContext("apiFetch('/api/tickets')",context);
  vm.runInContext("authToken='new-session-token'",context);
  complete({ok:true,json:async()=>({items:[{title:'Private old-session ticket'}]})});
  await assert.rejects(request,/Session changed/);
});

test('footer renderer honors reduced motion, suspends offscreen, and cleans up lifecycle observers',()=>{
  const source=fs.readFileSync(new URL('../apps/web/public/public.js',import.meta.url),'utf8');
  for(const reduced of [false,true]){
    const events=new Map<string,Function>();let frames=0,cancelled=0,disconnected=0;
    let intersection:Function=()=>{};
    const node=()=>({style:{setProperty(){}},classList:{add(){}},addEventListener(type:string,fn:Function){events.set(type,fn);},removeEventListener(){},getBoundingClientRect(){return {width:320,height:100,left:0,top:0};}});
    const ctx={clearRect(){},setTransform(){},beginPath(){},moveTo(){},arc(){},fill(){},save(){},restore(){},translate(){},scale(){},fillText(){},measureText(){return {width:250,actualBoundingBoxAscent:85,actualBoundingBoxDescent:0};},getImageData(){return {data:new Uint8ClampedArray(320*100*4).fill(255)};}};
    const wrap={...node()},canvas={...node(),dataset:{} as Record<string,string>,parentElement:wrap,getContext(){return ctx;}};
    const footer=node(),glass=node(),windowNode={...node(),devicePixelRatio:1};
    const documentNode={...node(),hidden:false,querySelector(selector:string){return ({'#dot-wordmark':canvas,'.signature-footer':footer,'.signature-glass':glass} as any)[selector];},querySelectorAll(){return [];},createElement(){return {getContext(){return ctx;}};}};
    const context=vm.createContext({document:documentNode,window:windowNode,matchMedia:()=>({...node(),matches:reduced}),performance:{now:()=>100},requestAnimationFrame:()=>++frames,cancelAnimationFrame:()=>cancelled++,IntersectionObserver:class{constructor(callback:Function){intersection=callback;}observe(){}disconnect(){disconnected++;}},ResizeObserver:class{observe(){}disconnect(){disconnected++;}}});
    vm.runInContext(source,context);
    assert.ok(Number(canvas.dataset.dotCount)>100);
    assert.equal(frames,0,'offscreen build must not start continuous animation');
    intersection([{isIntersecting:true}]);assert.equal(frames,1);
    intersection([{isIntersecting:false}]);assert.equal(cancelled,1);
    events.get('pagehide')!({persisted:false});assert.equal(disconnected,2);
  }
});
