import {assertBudget,store,recordSpend,HttpError,type Env} from './_lib';
import type {StoreApp} from './_policy';

async function run(env:Env,endpoint:string,queryParams:Record<string,unknown>,device?:string){
 const key=env.MONID_API_KEY || await env.MONID_SECRET?.get().catch(()=>undefined);
 if(!key)throw new HttpError(503,'App data backup is not configured.');
 await assertBudget(env);
 const s=await store(env);
 // Separate hard reservation cap: at most $1 of catalog-priced fallback calls.
 if(await s.incr('monid-reserved-usd',.00015)>1)throw new HttpError(503,'App data backup budget reached.');
 if(env.RUN_METER)env.RUN_METER.calls++;
 const r=await fetch('https://api.monid.ai/v1/run',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({provider:'litescrape',endpoint,input:{queryParams}}),signal:AbortSignal.timeout(12000)});
 const result=await r.json() as any;
 const billed=result.billing?.reportedCost;
 const cost=billed?.currency==='USD'&&billed?.unit==='MICRO_DOLLAR'&&Number.isFinite(billed.value)?billed.value/1000000:undefined;
 await recordSpend(env,{cost});
 if(cost!==undefined){
  await s.incr('dataSpend',cost);
  if(device&&device!=='anon'&&!env.RUN_METER)await Promise.all([s.incr(`usage:${device}:costUsd`,cost),s.incr(`usage:${device}:calls`,1),s.incr(`usage:${device}:pricedCalls`,1),s.incr(`usage:${device}:dataSpend`,cost)]);
 }
 if(!r.ok||result.status!=='COMPLETED'||result.providerResponse?.httpStatus>=400)throw new HttpError(503,'App data backup is temporarily unavailable.');
 return result.output;
}
export function monidApps(output:any):StoreApp[]{
 if(!Array.isArray(output?.organic_results))throw new HttpError(503,'App data backup returned an unreadable search.');
 return output.organic_results.filter((r:any)=>/^\d{5,12}$/.test(String(r.id))&&typeof r.title==='string').slice(0,24).map((r:any)=>{
  const raw=r.logos?.find((l:any)=>l.size==='512x512')?.link||r.logos?.[0]?.link;
  let icon:string|undefined;
  try{const u=new URL(raw);if(u.protocol==='https:'&&u.hostname.endsWith('.mzstatic.com'))icon=u.href;}catch{}
  return {id:String(r.id),name:r.title,seller:String(r.developer?.name||''),genre:String(r.genres?.find((g:any)=>g.primary)?.name||''),...(icon?{icon}:{})};
 });
}
export async function monidSearch(env:Env,q:string,device?:string){return monidApps(await run(env,'/app-store/search',{term:q,country:'us',num:24},device));}
export async function monidPolicy(env:Env,id:string){
 const p=await run(env,'/app-store/product',{product_id:id,country:'us'});
 if(String(p?.id)!==id)throw new HttpError(503,'App data backup returned a different app.');
 let u:URL;try{u=new URL(p.privacy?.privacy_policy_link);}catch{throw new HttpError(422,'This app does not provide a privacy-policy link.');}
 if(!['https:','http:'].includes(u.protocol))throw new HttpError(422,'Invalid privacy-policy link.');
 return {url:u.href,name:String(p.title||'This app')};
}
