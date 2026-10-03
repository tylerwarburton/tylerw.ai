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
const originalFetch=globalThis.fetch;
const model='typesafe/jev-1.13-20260917';
function answer(q,value) {
 if(q.type==='noul')return {type:'noul',noul:value??.02};
 const keys=q.type==='choice'?Object.keys(q.criteria):q.criteria.map((_,i)=>String(i));
 const selected=value??keys[keys.length-1];
 const probabilities=Object.fromEntries(keys.map(k=>[k,k===selected?1:0]));
 return q.type==='choice'?{type:'choice',choice:selected,confidence:1,probabilities}:{type:'score',score:Number(selected),confidence:1,probabilities,legend:Object.fromEntries(keys.map((k,i)=>[k,q.criteria[i]]))};
}
function response(b,values={},usage={cost:.001,input_tokens:100,output_tokens:20}) {
 return Response.json({model,provider:'TypeSafe',answers:Object.fromEntries(Object.entries(b.questions).map(([k,q])=>[k,answer(q,values[k])])),usage});
}
async function request(path,payload,device='test-session-123',headers={}) {
 return worker.fetch(new Request(`https://example.com${path}`,{method:'POST',headers:{'content-type':'application/json','x-device-id':device,...headers},body:JSON.stringify(payload)}),env,ctx);
}
async function usage(device='test-session-123') {
 return (await worker.fetch(new Request('https://example.com/api/usage',{headers:{'x-device-id':device}}),env,ctx)).json();
}
test('email uses native decisions, enforces order, and keeps personal usage isolated',async()=>{
 let calls=0,unsafe=false;
 globalThis.fetch=async(url,init)=>{calls++;assert.equal(url,'https://openrouter.ai/api/alpha/decisions');const b=JSON.parse(init.body);assert.equal(b.model,'typesafe/jev-1.13');assert.equal(b.messages,undefined);return response(b,{scam:unsafe?.98:.02});};
 const payload=stage=>({stage,text:'Please review the attached report by tomorrow.'});
 try {
  assert.equal((await request('/api/tools/scam',payload('priority'))).status,409);assert.equal(calls,0);
  assert.equal((await request('/api/tools/scam',payload('scam'))).status,200);
  assert.equal((await request('/api/tools/scam',payload('priority'))).status,409);
  assert.equal((await request('/api/tools/scam',payload('spam'))).status,200);
  const final=await (await request('/api/tools/scam',payload('priority'))).json();assert.equal(final.label,'information only');
  assert.equal(final.runUsage.costUsd,.001);assert.equal(final.runUsage.stages[0].kind,'decision');assert.equal(final.runUsage.stages[0].model,model);
  const own=await usage();assert.equal(own.costUsd,.003);assert.equal(own.jevDecisions,14);assert.equal(own.textSpend,0);assert.equal((await usage('other-session-456')).costUsd,0);
  unsafe=true;assert.equal((await (await request('/api/tools/scam',payload('scam'))).json()).stopped,true);
  const before=calls;assert.equal((await request('/api/tools/scam',payload('spam'))).status,409);assert.equal(calls,before);
 }finally{globalThis.fetch=originalFetch;}
});
test('malformed paid decisions are counted, retried on the same decision model, and missing cost stays incomplete',async()=>{
 let calls=0;
 globalThis.fetch=async(url,init)=>{assert.match(url,/alpha\/decisions$/);const b=JSON.parse(init.body);calls++;return calls===1?Response.json({model,answers:{q0:{type:'noul',noul:150}},usage:{cost:.002,input_tokens:50}}):response(b,{q0:.8},{input_tokens:70});};
 try{
  const res=await request('/api/tools/custom',{text:'Review the report.',questions:[{type:'noul',q:'Is action required?'}]},'test-cost-123');
  const data=await res.json();assert.equal(res.status,200);assert.equal(data.runUsage.costUsd,.002);assert.equal(data.runUsage.costComplete,false);assert.equal(data.runUsage.calls,2);assert.equal(data.runUsage.stages[0].status,'failed');assert.deepEqual(data.answers,[.8]);
 }finally{globalThis.fetch=originalFetch;}
});
await build({entryPoints:['functions/api/_lib.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'lib.mjs')});
const {pool,decide}=await import(pathToFileURL(join(dir,'lib.mjs')));
test('failed parallel checks settle in-flight usage and stop new work',async()=>{
 let release;const pending=new Promise(r=>release=r);let finished=false;const started=[];
 const run=pool([0,1,2,3],2,async i=>{started.push(i);if(i===0)throw Error('failed');await pending;finished=true;return i;});
 await Promise.resolve();await Promise.resolve();assert.deepEqual(started,[0,1]);release();await assert.rejects(run,/failed/);assert.equal(finished,true);
});
test('decision service failure never falls back to chat',async()=>{
 let calls=0;
 globalThis.fetch=async(url,init)=>{calls++;assert.match(url,/alpha\/decisions$/);assert.equal(JSON.parse(init.body).model,'typesafe/jev-1.13');throw Error('offline');};
 try{await assert.rejects(decide(env,'test',{q:{type:'noul',instructions:'Is this a test?'}}),e=>e.status===503&&e.extra.retryable===false);assert.equal(calls,2);}finally{globalThis.fetch=originalFetch;}
});
test('profile extraction stays a labeled text step, strips unrelated UI, then classifies edited tasks through decisions',async()=>{
 let calls=0;
 globalThis.fetch=async(url,init)=>{
  const b=JSON.parse(init.body);calls++;
  if(url.endsWith('/decisions')){assert.deepEqual(b.state.items,['Manage client relationships','Plan account strategy']);return response(b);}
  assert.doesNotMatch(b.messages[1].content,/PRIVATE_CHAT_SENTINEL|UNRELATED_ROLE_SENTINEL/);
  const data=calls===1?{title:'Senior Account Director',tasks:[]}:{tasks:['Manage client relationships','Plan account strategy']};
  return Response.json({model:'text-test',choices:[{message:{content:JSON.stringify(data)}}],usage:{cost:.001}});
 };
 try{
  const profile='Profile Name\nSenior Account Director\nPeople similar to Profile Name\nUNRELATED_ROLE_SENTINEL\nHighlights\nExperience\nSenior Account Director\nJan 2024 - Present\nAccount Director\n2023\nMore profiles for you\nPRIVATE_CHAT_SENTINEL';
  const data=await (await request('/api/tools/jobs',{action:'extract',profile},'profile-test-123')).json();assert.equal(data.source,'suggested');assert.equal(data.runUsage.stages.length,2);assert.ok(data.runUsage.stages.every(s=>s.kind==='text'));
  const classified=await (await request('/api/tools/jobs',{title:data.title,tasks:data.tasks.join('\n')},'profile-test-123')).json();assert.equal(classified.tasks.length,2);assert.equal(classified.checks,4);assert.equal(classified.runUsage.stages[0].kind,'decision');
 }finally{globalThis.fetch=originalFetch;}
});
await build({entryPoints:['functions/api/tools/xray.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'xray.mjs')});
const {score}=await import(pathToFileURL(join(dir,'xray.mjs')));
const policy={id:'test',name:'Example',category:'Tools',url:'https://example.com/privacy',updated:'',clauses:['Precise location only if you enable it.','We do not sell personal data.']};
test('policy decisions select actual source passages and verification rejects unsupported conclusions',async()=>{
 let calls=0;
 globalThis.fetch=async(url,init)=>{
  calls++;assert.match(url,/decisions$/);const b=JSON.parse(init.body);assert.equal(b.state.policy.p0,policy.clauses[0]);
  if(calls===2)return response(b,{location:.95,sells:.1});
  return response(b,Object.fromEntries(Object.keys(b.questions).map(k=>[k,k.endsWith('_source')?(k==='location_source'?'p0':k==='sells_source'?'p1':'none'):k==='location'?'conditional':k==='sells'?'denied':'not_found'])));
 };
 try{const r=await score(env,policy);assert.equal(calls,2);assert.equal(r.rows.find(x=>x.key==='location').assessment,'conditional');assert.equal(r.rows.find(x=>x.key==='location').evidence,policy.clauses[0]);assert.equal(r.rows.find(x=>x.key==='sells').assessment,'unclear');assert.equal(r.rows.find(x=>x.key==='health').evidence,'');assert.equal(r.checks,26);assert.equal(r.model,model);}finally{globalThis.fetch=originalFetch;}
});
test('failed policy verification returns review items, not invented or unverified claims',async()=>{
 let calls=0;
 globalThis.fetch=async(url,init)=>{
  if(++calls>1)throw Error('offline');const b=JSON.parse(init.body);
  return response(b,Object.fromEntries(Object.keys(b.questions).map(k=>[k,k.endsWith('_source')?'p0':'stated'])));
 };
 try{const r=await score(env,policy);assert.ok(r.rows.every(x=>x.assessment==='unclear'));assert.equal(calls,3);}finally{globalThis.fetch=originalFetch;}
});
test('attendee decision endpoint shares token limits, rejects other models, and passes native probabilities',async()=>{
 globalThis.fetch=async(url,init)=>response(JSON.parse(init.body),{urgent:.9});
 try{
  const token=await (await request('/api/token',{},'builder-test-123')).json();const headers={authorization:`Bearer ${token.token}`};
  const payload={model:'typesafe/jev-1.13',state:{message:'Act now'},questions:{urgent:{type:'noul',instructions:'Is action requested?'}}};
  assert.equal((await request('/api/v1/systemone',payload,'builder-test-123')).status,401);
  assert.equal((await request('/api/v1/systemone',{...payload,model:'other'},'builder-test-123',headers)).status,400);
  const r=await (await request('/api/v1/systemone',payload,'builder-test-123',headers)).json();assert.equal(r.model,model);assert.equal(r.answers.urgent.noul,.9);assert.equal(r.runUsage.stages[0].kind,'decision');
  assert.equal((await request('/api/v1/chat/completions',{model:'typesafe/jev-1.13',messages:[]},'builder-test-123',headers)).status,400);
 }finally{globalThis.fetch=originalFetch;}
});
test('large policies retain every passage, bound request sizes, and flag cross-section conflicts',async()=>{
 const clauses=Array.from({length:180},(_,i)=>`PASSAGE_${i} `+'Policy context including conditions. '.repeat(25));
 const seen=new Set();let calls=0;
 globalThis.fetch=async(url,init)=>{
  calls++;assert.ok(init.body.length<=110000);const b=JSON.parse(init.body);
  Object.values(b.state.policy).forEach(p=>seen.add(p));
  const first=Object.values(b.state.policy)[0].startsWith('PASSAGE_0 ');
  return response(b,Object.fromEntries(Object.entries(b.questions).map(([k,q])=>[k,q.type==='noul'?.95:k.endsWith('_source')?'p0':k==='location'?(first?'denied':'conditional'):'not_found'])));
 };
 try{const r=await score(env,{...policy,clauses});assert.equal(seen.size,180);assert.ok(calls>2);assert.equal(r.rows.find(r=>r.key==='location').assessment,'unclear');assert.equal(r.clauses,180);}finally{globalThis.fetch=originalFetch;}
});
