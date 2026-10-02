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
