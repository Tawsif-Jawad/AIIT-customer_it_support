import {test as baseTest,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApiServer} from '../../apps/api/src/app.ts';
import {connectPostgres, createPostgresApiServer} from '../../apps/api/src/postgres-runtime.ts';
import {disposablePostgres, fixtureIdentities, runtimeFixture} from '../support/disposable-postgres.ts';
import {importJsonSnapshot} from '../../scripts/json-import.ts';
import {createWebServer} from '../../apps/web/src/server.ts';
const postgres = process.env.AIIT_E2E_POSTGRES === 'true';
const employee = postgres ? fixtureIdentities[0].email : 'tawsif.zawad@upstra.com';
const customer = postgres ? fixtureIdentities[2].email : 'rahim.chowdhury@client.upstra.local';
const admin = postgres ? fixtureIdentities[3].email : 'kamal.hossain@upstra.local';
const cto = postgres ? fixtureIdentities[4].email : 'farhana.ahmed@upstra.local';
const test=baseTest.extend({baseURL:async({},use)=>{
 process.env.NODE_ENV='test';process.env.AUTH_MODE='dev_oidc';process.env.MAIL_PROVIDER='mock';
 const webFactory=process.env.AIIT_AUDIT_BASELINE_WEB?(await import(process.env.AIIT_AUDIT_BASELINE_WEB)).createWebServer:createWebServer;
 const cluster = postgres ? await disposablePostgres() : undefined;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiit-browser-audit-'));
 const client = cluster ? await connectPostgres({ NODE_ENV: 'test', STORAGE_MODE: 'postgres', DATABASE_URL: cluster.url }) : undefined;
 if (client) await importJsonSnapshot(client, runtimeFixture());
 const app = client ? await createPostgresApiServer(client) : createApiServer(path.join(dir,'db.json'));
 await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const web=webFactory('http://127.0.0.1:'+(app.server.address() as {port:number}).port);
 await new Promise<void>(r=>web.listen(0,'127.0.0.1',r));
 try{
  const ready = await app.inject({ method: 'GET', url: '/api/ready' });
  expect(ready.data.storageMode).toBe(postgres ? 'postgres' : 'json');
  await use('http://127.0.0.1:'+(web.address() as {port:number}).port);
 }finally{await new Promise<void>(r=>web.close(()=>r()));await new Promise<void>(r=>app.server.close(()=>r()));await client?.$disconnect();cluster?.close();fs.rmSync(dir,{recursive:true,force:true});}
}});
const observations=new Map<Page,{errors:string[];failedRequests:{path:string;reason:string}[];httpErrors:{path:string;status:number}[]}>();
test.beforeEach(async({page})=>{const record={errors:[] as string[],failedRequests:[] as {path:string;reason:string}[],httpErrors:[] as {path:string;status:number}[]};observations.set(page,record);page.on('pageerror',e=>record.errors.push(e.message));page.on('requestfailed',r=>record.failedRequests.push({path:new URL(r.url()).pathname,reason:r.failure()?.errorText||'unknown'}));page.on('response',r=>{if(r.status()>=400)record.httpErrors.push({path:new URL(r.url()).pathname,status:r.status()});});});
test.afterEach(async({page},info)=>{const record=observations.get(page)!;if(process.env.AIIT_AUDIT_EVIDENCE_DIR){const dir=path.resolve(process.env.AIIT_AUDIT_EVIDENCE_DIR);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'browser-observation-'+info.title.replace(/[^a-z0-9]+/gi,'-').slice(0,85)+'.json'),JSON.stringify({test:info.title,...record},null,2)+'\n');}expect(record.errors).toEqual([]);observations.delete(page);});
async function signIn(page:Page,email=employee){
 await page.goto('/app');await expect(page.locator('#login-identity-select option')).not.toHaveCount(0);
 await page.fill('#login-email-input',email);await page.click('#login-submit-btn');await expect(page.locator('#workspace-section')).toBeVisible();
}
async function tab(page:Page,name:string){
 if(await page.locator('body').evaluate(el=>innerWidth<768&&!el.classList.contains('nav-open')))await page.click('#app-menu');
 await page.click(`button[data-tab="${name}"]`);await expect(page.locator('#tab-'+name)).toBeVisible();
}
async function shot(page:Page,name:string){if(process.env.AIIT_AUDIT_EVIDENCE_DIR){const dir=path.resolve(process.env.AIIT_AUDIT_EVIDENCE_DIR,'screenshots');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,name+'.png'),fullPage:true});}}
async function create(page:Page,title:string,category='cat-outlook-config'){
 await tab(page,'create');await page.selectOption('#ticket-category',category);if(category==='cat-ad-account'){await page.fill('#ticket-service-targetAdGroup','Synthetic readers');await page.fill('#ticket-service-businessJustification','Synthetic review access');}else{await page.selectOption('#ticket-service-osPlatform','macOS');}await page.fill('#ticket-title',title);await page.fill('#ticket-description','Synthetic audit Outlook TLS setup requires assistance with configuration');
 const response=page.waitForResponse(r=>r.url().endsWith('/api/tickets')&&r.request().method()==='POST');await page.click('#submit-ticket-btn');const result=await response;expect(result.status()).toBe(201);return (await result.json()).ticket;
}

test('browser employee full lifecycle, comments, assets, KB, notifications and signout',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await signIn(page);
 const ticket=await create(page,'Browser audit Outlook lifecycle');await expect(page.getByTestId('detail-ticket-status')).toHaveText('RESOLVED_PENDING_CONFIRMATION');
 await page.fill('#ticket-comment','Browser audit synthetic comment');await page.locator('#ticket-comment-form button').click();await expect(page.locator('#ticket-detail-container')).toContainText('Browser audit synthetic comment');
 await page.click('#btn-confirm-close');await expect(page.getByTestId('detail-ticket-status')).toHaveText('CLOSED');
 await page.reload();await expect(page.locator('#workspace-section')).toBeVisible();await tab(page,'tickets');await page.fill('#filter-search',ticket.ticketNumber);await page.click('#refresh-tickets-btn');
 await expect(page.locator('#ticket-list-container')).toContainText(ticket.ticketNumber);
 await tab(page,'assets');const ack=page.getByRole('button',{name:'Acknowledge Custody'});if(await ack.count()){await ack.first().click();await expect(page.locator('#assets-container')).toContainText('ACKNOWLEDGED');}
 await tab(page,'kb');await page.fill('#kb-search','Outlook');await expect(page.locator('#kb-container')).toContainText('Outlook');
 await tab(page,'notifications');await page.click('#refresh-notifications');await expect(page.locator('#notifications-list')).toContainText(ticket.ticketNumber);
 await shot(page,'employee-desktop');await page.click('#logout-btn');await expect(page.locator('#login-section')).toBeVisible();expect(errors).toEqual([]);
});
test('browser customer creates and rejects mock resolution without IT privileges',async({page})=>{
 await signIn(page,customer);await tab(page,'assets');await expect(page.locator('#assets-container')).toContainText('No equipment');await create(page,'Customer audit Outlook question');await page.click('#btn-reopen-it');await expect(page.getByTestId('detail-ticket-status')).toHaveText('ASSIGNED_TO_IT');
 await expect(page.locator('#btn-start-progress')).toHaveCount(0);await expect(page.locator('#tab-btn-approvals')).toBeHidden();await shot(page,'customer-desktop');
});
test('browser IT approval/internal note/escalation and CTO review share persisted ticket',async({page})=>{
 await signIn(page);const ticket=await create(page,'Browser audit AD approval','cat-ad-account');await page.click('#logout-btn');await expect(page.locator('#login-section')).toBeVisible();
 await page.fill('#login-email-input',admin);await page.click('#login-submit-btn');await expect(page.locator('#workspace-section')).toBeVisible();
 await tab(page,'tickets');await page.fill('#filter-search',ticket.ticketNumber);await page.click('#refresh-tickets-btn');await page.locator('#ticket-list-container [role="button"]').first().click();
 await page.click('#btn-start-progress');await expect(page.getByTestId('detail-ticket-status')).toHaveText('IN_PROGRESS');
 await page.fill('#ticket-comment','Private audit note for IT');await page.check('#comment-internal');await page.locator('#ticket-comment-form button').click();await expect(page.locator('#ticket-detail-container')).toContainText('INTERNAL NOTE');
 await tab(page,'approvals');await page.fill('#approval-reason','Reviewed synthetic audit request');const row=page.locator('#approvals-container tr').filter({hasText:ticket.ticketNumber});await row.getByRole('button',{name:'Approve',exact:true}).click();await expect(row).toContainText('APPROVED');
 await tab(page,'tickets');await page.click('#btn-escalate-cto');await expect(page.getByTestId('detail-ticket-status')).toHaveText('ESCALATED_TO_CTO');await shot(page,'it-escalation');
 await page.click('#logout-btn');await expect(page.locator('#login-section')).toBeVisible();await page.fill('#login-email-input',cto);await page.click('#login-submit-btn');await expect(page.locator('#workspace-section')).toBeVisible();
 await tab(page,'cto');await expect(page.getByTestId('cto-escalated-row').filter({hasText:ticket.ticketNumber})).toBeVisible();await tab(page,'tickets');await page.fill('#filter-search',ticket.ticketNumber);await page.click('#refresh-tickets-btn');await page.locator('#ticket-list-container [role="button"]').first().click();await page.click('#btn-cto-resolve');await expect(page.getByTestId('detail-ticket-status')).toHaveText('RESOLVED_PENDING_CONFIRMATION');
 await tab(page,'audit');await expect(page.locator('#audit-logs-container')).toContainText('TICKET_ESCALATED_TO_CTO');await expect(page.locator('#connector-health-box')).toContainText('MOCK');await shot(page,'cto-audit');
});
test('AU08 logout failure remains signed in and shows retry feedback',async({page})=>{
 await signIn(page);await page.route('**/api/auth/logout',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Synthetic storage outage'}})}));
 await page.click('#logout-btn');await expect(page.locator('#global-feedback')).toContainText('Your session is still active');await expect(page.getByTestId('active-user-badge')).toContainText(postgres ? fixtureIdentities[0].name : 'Tawsif');await shot(page,'logout-failure');await page.unroute('**/api/auth/logout');await page.click('#logout-btn');await expect(page.locator('#login-section')).toBeVisible();
});
test('assistant creates a mock request; catalog start and recoverable panel errors work',async({page})=>{
 await signIn(page);await tab(page,'catalog');await page.locator('[data-service="cat-outlook-config"]').click();await expect(page.locator('#tab-create')).toBeVisible();
 await tab(page,'assistant');await page.selectOption('#assistant-category','cat-outlook-config');await page.selectOption('#assistant-service-osPlatform','macOS');await page.fill('#assistant-input','How do I configure Outlook TLS for this synthetic audit?');await page.locator('#assistant-form button').click();await expect(page.locator('#assistant-messages')).toContainText('MOCK AI RECOMMENDATION');await page.click('#assistant-view-ticket');await expect(page.locator('#ticket-detail-container')).toContainText('Outlook');
 await page.route('**/api/assets',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Synthetic panel outage'}})}));await tab(page,'assets');await expect(page.locator('#assets-container')).toContainText('Synthetic panel outage');await page.unroute('**/api/assets');await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.locator('#assets-container table')).toBeVisible();
});
for(const width of [320,390,768,1440])test(`responsive landing/workspace, menu and keyboard at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/');await expect(page.locator('h1')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const href of await page.locator('a[href^="#"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')))){if(href&&href!=='#')expect(await page.locator(href).count()).toBeGreaterThan(0);}
 await signIn(page);await tab(page,'catalog');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(width<768){await page.click('#app-menu');await page.keyboard.press('Escape');await expect(page.locator('#app-menu')).toBeFocused();}
 await shot(page,'workspace-'+width);
});

test('AU09 a delayed older detail response cannot replace the selected ticket',async({page})=>{
 await signIn(page);await create(page,'Race detail synthetic Outlook');await tab(page,'tickets');const rows=page.locator('[data-ticket-id]');await expect(rows).toHaveCount(2);
 const first=await rows.nth(0).getAttribute('data-ticket-id');const second=await rows.nth(1).getAttribute('data-ticket-id');
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 await page.route('**/api/tickets/'+first,async route=>{await gate;await route.continue();});
 await rows.nth(0).click();const secondResponse=page.waitForResponse(r=>r.url().endsWith('/api/tickets/'+second));await rows.nth(1).click();const title=(await (await secondResponse).json()).ticket.title;await expect(page.locator('#ticket-detail-container h2')).toHaveText(title);
 const oldResponse=page.waitForResponse(r=>r.url().endsWith('/api/tickets/'+first));release();await oldResponse;
 await expect(page.locator('#ticket-detail-container h2')).toHaveText(title!);
 await expect(page.locator(`[data-ticket-id="${second}"]`)).toHaveClass(/selected/);
});

test('ticket filters, pagination, keyboard activation and required form fields work',async({page,baseURL})=>{
 await signIn(page);
 for(let i=0;i<26;i++){
  const response=await page.request.post(baseURL+'/api/tickets',{headers:{origin:baseURL!},data:{title:'Pagination browser fixture '+i,description:'Outlook configuration synthetic audit pagination test',serviceCategoryId:'cat-outlook-config', customFormPayload: { osPlatform: 'macOS' },severity:'LOW'}});expect(response.status()).toBe(201);
 }
 await tab(page,'tickets');await page.fill('#filter-search','Pagination browser fixture');await page.selectOption('#filter-status','RESOLVED_PENDING_CONFIRMATION');await page.selectOption('#filter-severity','LOW');await page.click('#refresh-tickets-btn');
 await expect(page.locator('#page-label')).toHaveText('Page 1 of 2');await page.click('#next-page');await expect(page.locator('#page-label')).toHaveText('Page 2 of 2');await expect(page.locator('.ticket-row')).toHaveCount(1);await page.click('#previous-page');await expect(page.locator('#page-label')).toHaveText('Page 1 of 2');
 await page.locator('.ticket-row').first().focus();await page.keyboard.press('Enter');await expect(page.locator('#ticket-detail-container')).toContainText('Pagination browser fixture');
 await tab(page,'create');await page.click('#submit-ticket-btn');expect(await page.locator('#ticket-title').evaluate((el:HTMLInputElement)=>el.validity.valueMissing)).toBe(true);
});


test('sampled text contrast is measured without assuming whole-app accessibility',async({page})=>{
 await signIn(page);
 const samples=[];
 for(const selector of ['#workspace-greeting','#workspace-context','#quick-create'])samples.push(await page.locator(selector).evaluate(el=>{
  const rgb=(value:string)=>value.match(/[\d.]+/g)!.map(Number);let bg=[255,255,255];let parent:Element|null=el;
  while(parent){const c=rgb(getComputedStyle(parent).backgroundColor);if(c.length<4||c[3]>0){bg=c.slice(0,3).map((n,i)=>n*(c[3]??1)+255*(1-(c[3]??1)));break;}parent=parent.parentElement;}
  const style=getComputedStyle(el),fg=rgb(style.color);const lum=(c:number[])=>c.map(n=>{const s=n/255;return s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[0.2126,0.7152,0.0722][i],0);
  const a=lum(fg),b=lum(bg);return {id:el.id,ratio:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05),fontSize:style.fontSize,scope:'opaque/inherited background sample only'};
 }));
 if(process.env.AIIT_AUDIT_EVIDENCE_DIR)fs.writeFileSync(path.resolve(process.env.AIIT_AUDIT_EVIDENCE_DIR,'contrast-samples.json'),JSON.stringify(samples,null,2)+'\n');expect(samples.every(s=>Number.isFinite(s.ratio))).toBe(true);
});
