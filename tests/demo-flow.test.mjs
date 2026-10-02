import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(join(tmpdir(),'demo-flow-'));
await build({entryPoints:['worker/index.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'worker.mjs'),plugins:[{name:'cf-test',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'cf',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export class DurableObject {}'}));}}]});
const {default:worker}=await import(pathToFileURL(join(dir,'worker.mjs')));
const env={OPENROUTER_API_KEY:'test-only',ASSETS:{fetch(){throw Error('Unexpected assets request');}}};
const ctx={waitUntil(p){return p;},passThroughOnException(){}};
async function request(stage,device='test-session-123',text='Please review the attached report by tomorrow.') {
 return worker.fetch(new Request('https://example.com/api/tools/scam',{method:'POST',headers:{'content-type':'application/json','x-device-id':device},body:JSON.stringify({text,stage})}),env,ctx);
}
async function usage(device='test-session-123') {
 return (await worker.fetch(new Request('https://example.com/api/usage',{headers:{'x-device-id':device}}),env,ctx)).json();
}
const originalFetch=globalThis.fetch;
test('email stages enforce order, stop on scam, and keep personal usage isolated',async()=>{
 let calls=0,unsafe=false;
 globalThis.fetch=async(url,init)=>{
  calls++;
  const schema=JSON.parse(init.body).response_format.json_schema.schema;
  const data=Object.fromEntries(Object.entries(schema.properties).map(([k,v])=>[k,v.type==='array'?Array.from({length:v.minItems},(_,i)=>i===v.minItems-1?100:0):k==='scam'&&unsafe?98:2]));
  return Response.json({choices:[{message:{content:JSON.stringify(data)},finish_reason:'stop'}],usage:{cost:.001,prompt_tokens:100,completion_tokens:20}});
 };
 try {
  assert.equal((await request('priority')).status,409);assert.equal(calls,0);
  assert.equal((await request('scam')).status,200);
  assert.equal((await request('priority')).status,409);assert.equal(calls,1);
  assert.equal((await request('spam')).status,200);
  const final=await (await request('priority')).json();assert.equal(final.label,'information only');
  assert.equal(final.runUsage.costUsd,.001);assert.equal(final.runUsage.costComplete,true);
  const own=await usage();assert.equal(own.costUsd,.003);assert.equal(own.runs,3);assert.equal(own.decisions,14);
  assert.equal((await usage('other-session-456')).costUsd,0);
  unsafe=true;
  assert.equal((await (await request('scam')).json()).stopped,true);
  const before=calls;assert.equal((await request('spam')).status,409);assert.equal(calls,before);
 } finally {globalThis.fetch=originalFetch;}
});
test('missing provider cost is marked incomplete, including paid malformed retries',async()=>{
 let calls=0;
 globalThis.fetch=async()=>Response.json({choices:[{message:{content:++calls===1?'invalid':JSON.stringify({spam:2})}}],usage:calls===1?{cost:.002,prompt_tokens:50}:{prompt_tokens:70}});
 try {
  globalThis.fetch=async()=>Response.json({choices:[{message:{content:++calls===1?'invalid':JSON.stringify({q0:2})}}],usage:calls===1?{cost:.002,prompt_tokens:50}:{prompt_tokens:70}});
  const res=await worker.fetch(new Request('https://example.com/api/tools/custom',{method:'POST',headers:{'content-type':'application/json','x-device-id':'test-cost-123'},body:JSON.stringify({text:'Please review the report.',questions:[{type:'noul',q:'Is action required?'}]})}),env,ctx);
  const result=await res.json();assert.equal(res.status,200);assert.equal(result.runUsage.costUsd,.002);assert.equal(result.runUsage.costComplete,false);assert.equal(result.runUsage.calls,2);
 }finally {globalThis.fetch=originalFetch;}
});
await build({entryPoints:['functions/api/_lib.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'lib.mjs')});
const {pool}=await import(pathToFileURL(join(dir,'lib.mjs')));
test('failed parallel checks settle in-flight usage and stop new work',async()=>{
 let release;
 const pending=new Promise(r=>release=r);
 let finished=false;
 const started=[];
 const run=pool([0,1,2,3],2,async i=>{started.push(i);if(i===0)throw Error('failed check');await pending;finished=true;return i;});
 await Promise.resolve();await Promise.resolve();
 assert.deepEqual(started,[0,1]);assert.equal(finished,false);
 release();await assert.rejects(run,/failed check/);assert.equal(finished,true);
});
test('title-only profiles get labeled suggestions and unrelated copied UI is removed before inference',async()=>{
 let calls=0;
 globalThis.fetch=async(url,init)=>{
  const body=JSON.parse(init.body);
  assert.doesNotMatch(body.messages[1].content,/PRIVATE_CHAT_SENTINEL|UNRELATED_ROLE_SENTINEL/);
  const data=++calls===1?{title:'Senior Account Director',tasks:[]}:{tasks:['Manage client relationships','Plan account strategy','Coordinate project delivery','Review account performance','Coach account teams']};
  return Response.json({choices:[{message:{content:JSON.stringify(data)}}],usage:{cost:.001}});
 };
 try {
  const profile='Profile Name\nSenior Account Director\nPeople similar to Profile Name\nUNRELATED_ROLE_SENTINEL\nHighlights\nExperience\nSenior Account Director\nJan 2024 - Present\nAccount Director\n2023\nMore profiles for you\nPRIVATE_CHAT_SENTINEL';
  const res=await worker.fetch(new Request('https://example.com/api/tools/jobs',{method:'POST',headers:{'content-type':'application/json','x-device-id':'profile-test-123'},body:JSON.stringify({action:'extract',profile})}),env,ctx);
  const data=await res.json();assert.equal(res.status,200);assert.equal(data.source,'suggested');assert.equal(data.tasks.length,5);assert.equal(calls,2);
 }finally{globalThis.fetch=originalFetch;}
});
await build({entryPoints:['functions/api/tools/xray.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'xray.mjs')});
const {score,XRAY_QUESTIONS}=await import(pathToFileURL(join(dir,'xray.mjs')));
test('policy context uses one call for supported findings and counts questions',async()=>{
 let calls=0;
 globalThis.fetch=async(url,init)=>{
  calls++;
  const b=JSON.parse(init.body), schema=b.response_format.json_schema.schema;
  let data;
  if(schema.properties.rows){
   data={rows:Object.keys(XRAY_QUESTIONS).map(key=>({key,assessment:key==='location'?'conditional':key==='sells'?'denied':'not_found',summary:key==='location'?'Precise location is collected only if enabled.':key==='sells'?'The policy denies selling personal data.':'Not found in the supplied text.',clause:key==='location'?0:key==='sells'?1:-1,needsVerification:false}))};
  }else{
   const n=Number(b.messages[1].content.match(/\((\d+) items,/)[1]);
   const keys=Object.keys(schema.properties.items.items.properties).filter(k=>k!=='i');
   data={items:Array.from({length:n},(_,i)=>Object.fromEntries([['i',i],...keys.map(k=>[k,90])]))};
  }
  return Response.json({choices:[{message:{content:JSON.stringify(data)}}],usage:{cost:.001}});
 };
 try{
  const r=await score(env,{id:'test',name:'Example',category:'Tools',url:'https://example.com/privacy',updated:'',clauses:['We collect precise location only when you enable it.','We do not sell personal data.']});
  assert.equal(r.rows.find(x=>x.key==='location').assessment,'conditional');assert.equal(r.rows.find(x=>x.key==='sells').assessment,'denied');assert.equal(r.rows.find(x=>x.key==='health').evidence,'');assert.equal(r.risks,0);assert.equal(calls,1);assert.equal(r.checks,12);
 }finally{globalThis.fetch=originalFetch;}
});

test('policy review follows up only unresolved topics and keeps unsupported findings unclear',async()=>{
 const requests=[];
 globalThis.fetch=async(url,init)=>{
  const b=JSON.parse(init.body), input=JSON.parse(b.messages[1].content);
  requests.push(input);
  const data={rows:Object.keys(input.questions).map(key=>({key,assessment:key==='location'?'stated':'not_found',summary:'Example finding.',clause:key==='location'?0:-1,needsVerification:key==='location'}))};
  return Response.json({choices:[{message:{content:JSON.stringify(data)}}],usage:{cost:.001}});
 };
 try{
  const r=await score(env,{id:'test',name:'Example',category:'Tools',url:'https://example.com/privacy',updated:'',clauses:['Location information may be processed.']});
  assert.equal(requests.length,2);assert.deepEqual(Object.keys(requests[1].questions),['location']);
  assert.equal(requests[1].clauses.length,1);assert.equal(r.rows.find(x=>x.key==='location').assessment,'unclear');assert.equal(r.risks,0);assert.equal(r.checks,12);
 }finally{globalThis.fetch=originalFetch;}
});

test('a conditional summary with an unconditional label receives focused verification',async()=>{
 let calls=0;
 globalThis.fetch=async(url,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);calls++;
  const data={rows:Object.keys(input.questions).map(key=>({key,assessment:key==='location'?(calls===1?'stated':'conditional'):'not_found',summary:key==='location'?'Precise location is shared when you enable that setting.':'Not found.',clause:key==='location'?0:-1,needsVerification:false}))};
  return Response.json({choices:[{message:{content:JSON.stringify(data)}}],usage:{cost:.001}});
 };
 try{
  const r=await score(env,{id:'test',name:'Example',category:'Tools',url:'https://example.com/privacy',updated:'',clauses:['You can enable precise location.']});
  assert.equal(calls,2);assert.equal(r.rows.find(x=>x.key==='location').assessment,'conditional');
 }finally{globalThis.fetch=originalFetch;}
});

test('failed follow-up preserves completed findings and marks unresolved topics unclear',async()=>{
 let calls=0;
 globalThis.fetch=async(url,init)=>{
  calls++;
  if(calls>1)throw Error('provider unavailable');
  const data={rows:Object.keys(XRAY_QUESTIONS).map(key=>({key,assessment:key==='location'?'unclear':key==='sells'?'denied':'not_found',summary:key==='sells'?'No sale of personal data.':'Unresolved.',clause:key==='sells'?0:-1,needsVerification:key==='location'}))};
  return Response.json({choices:[{message:{content:JSON.stringify(data)}}],usage:{cost:.001}});
 };
 try{
  const r=await score(env,{id:'test',name:'Example',category:'Tools',url:'https://example.com/privacy',updated:'',clauses:['We do not sell personal data.']});
  assert.equal(calls,4);assert.equal(r.rows.find(x=>x.key==='sells').assessment,'denied');assert.equal(r.rows.find(x=>x.key==='location').assessment,'unclear');
 }finally{globalThis.fetch=originalFetch;}
});
test('initial service failure is bounded and does not blame room traffic',async()=>{
 const requested=[];
 globalThis.fetch=async(url,init)=>{requested.push(JSON.parse(init.body).model);throw Error('offline');};
 try{
  await assert.rejects(score({...env,DEMO_FALLBACK_MODELS:'test-backup-a,test-backup-b'},{id:'test',name:'Example',category:'Tools',url:'https://example.com/privacy',updated:'',clauses:['Privacy policy.']}),e=>e.status===503 && e.extra.retryable===false && !/room|busy/i.test(e.message));
  assert.equal(requested.length,3);assert.equal(new Set(requested).size,3);
 }finally{globalThis.fetch=originalFetch;}
});
