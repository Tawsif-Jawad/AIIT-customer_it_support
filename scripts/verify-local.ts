#!/usr/bin/env node
/** No-cloud development verification. No secrets, payment, deploy or status APIs.
 * Run: node scripts/verify-local.ts [--output NEW_DIRECTORY]
 * Every child uses pinned pnpm and fixtures; the final exit is nonzero if any
 * check fails or protected local data changes. This never satisfies hosted CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const VERIFICATION_COMMANDS:readonly (readonly string[])[]=[
 ['install','--frozen-lockfile','--ignore-scripts'],['db:generate'],['typecheck'],['lint'],['build'],
 ['test'],['test:security'],['test:db'],['test:e2e'],['audit','--audit-level=moderate'],
];
export function parseTestCounts(output:string):Record<string,number> {
 const counts:Record<string,number>={};
 for(const key of ['tests','pass','fail','skipped']) {
  const found=output.match(new RegExp('ℹ '+key+' (\\d+)'));if(found)counts[key]=Number(found[1]);
 }
 if(!('tests' in counts))for(const [key,label] of [['pass','passed'],['fail','failed'],['skipped','skipped']] as const) {
  const found=output.match(new RegExp('(?:^|\\n)\\s*(\\d+) '+label+'(?:\\s|$)'));if(found)counts[key]=Number(found[1]);
 }
 if(!('tests' in counts)&&'pass' in counts){counts.fail??=0;counts.skipped??=0;counts.tests=counts.pass+counts.fail+counts.skipped;}
 return counts;
}
export async function runVerification(outputDirectory?:string):Promise<{exitCode:number;directory:string}> {
 const root=fileURLToPath(new URL('../',import.meta.url));
 const directory=outputDirectory?path.resolve(outputDirectory):fs.mkdtempSync(path.join(os.tmpdir(),'aiit-verify-'));
 if(outputDirectory)fs.mkdirSync(directory,{recursive:false}); // refuse overwriting evidence
 const protectedFiles=['.data/enterprise-db.json','.env'];
 const hash=(relative:string)=>{const file=path.join(root,relative);return fs.existsSync(file)?crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null;};
 const before=protectedFiles.map(hash);
 const pnpmVersion=(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')) as {packageManager:string}).packageManager;
 if(pnpmVersion!=='pnpm@9.15.0')throw new Error('Verification requires reviewed pnpm@9.15.0');
 const expectedNode=fs.readFileSync(path.join(root,'.node-version'),'utf8').trim();
 if(process.versions.node!==expectedNode)throw new Error(`Use Node ${expectedNode}; found ${process.versions.node}`);
 const env={...process.env,NODE_ENV:'test',AUTH_MODE:'dev_oidc',MAIL_PROVIDER:'mock',DB_REQUIRED:'true',DATABASE_URL:'postgresql://aiit_test@127.0.0.1:1/aiit_test'};
 // NODE_OPTIONS can load arbitrary code, but this script never logs its value.
 // No external DATABASE_URL/AD/mail configuration is used by test resources.
 const results:{command:string;exitCode:number;signal:string|null;log:string;counts:Record<string,number>}[]=[];
 for(let index=0;index<VERIFICATION_COMMANDS.length;index++) {
  const args=VERIFICATION_COMMANDS[index];
  const prefix=['exec','--yes','--package=pnpm@9.15.0','--','pnpm'];
  const label=`${String(index+1).padStart(2,'0')}-${args[0].replaceAll(':','-')}.log`;
  const descriptor=fs.openSync(path.join(directory,label),'wx',0o600);
  let output='';let finished=false;
  const outcome=await new Promise<{code:number;signal:string|null}>(resolve=>{
   const child=spawn('npm',[...prefix,...args],{cwd:root,env,stdio:['ignore','pipe','pipe']});
   const record=(chunk:Buffer)=>{fs.writeSync(descriptor,chunk);output+=chunk.toString();};
   child.stdout.on('data',record);child.stderr.on('data',record);
   child.on('error',error=>{record(Buffer.from('Verification process could not start: '+error.name+'\n'));});
   child.on('close',(code,signal)=>{if(!finished){finished=true;fs.closeSync(descriptor);resolve({code:code??1,signal});}});
  });
  results.push({command:'npm '+[...prefix,...args].join(' '),exitCode:outcome.code,signal:outcome.signal,log:label,counts:parseTestCounts(output)});
  console.log(`${args.join(' ')}: exit ${outcome.code}`);
 }
 const after=protectedFiles.map(hash);
 const preserved=before.every((value,index)=>value===after[index]);
 const exitCode=preserved&&results.every(result=>result.exitCode===0)?0:1;
 const report={scope:'LOCAL_DEVELOPMENT_ONLY',hostedCiPassed:false,alternativeCiActive:false,node:process.versions.node,pnpm:pnpmVersion,results,preservation:{operationalUnchanged:before[0]===after[0],configurationUnchanged:before[1]===after[1],operationalBefore:before[0],operationalAfter:after[0]},exitCode};
 fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(`Evidence: ${directory}`);return {exitCode,directory};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const args=process.argv.slice(2);
 if(args.length!==0&&(args.length!==2||args[0]!=='--output'))throw new Error('Usage: node scripts/verify-local.ts [--output NEW_DIRECTORY]');
 const result=await runVerification(args[1]);process.exitCode=result.exitCode;
}
