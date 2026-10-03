// Temporary, fixed, non-billable catalog diagnostic. Never returns credentials.
import {handler,json,rateLimit,deviceId,HttpError} from '../_lib';
let cached:unknown;
export const onRequestGet=handler(async({env,request})=>{
 await rateLimit({...env,ROOM:undefined,DEMO_DB:undefined},`${deviceId(request)}:provider-check`,3);
 if(!env.MONID_API_KEY)return json({configured:false});
 if(cached)return json(cached);
 async function call(path:string,input:unknown){
  const r=await fetch(`https://api.monid.ai/v1/${path}`,{method:'POST',headers:{authorization:`Bearer ${env.MONID_API_KEY}`,'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new HttpError(502,`Monid catalog returned HTTP ${r.status}.`);
  return await r.json() as any;
 }
 const d=await call('discover',{query:'litescrape Apple App Store search apps and app details',limit:8});
 const results=[];
 for(const item of d.results||[]){
  const meta={provider:item.provider,endpoint:item.endpoint,description:item.description,price:item.price};
  if(item.provider==='litescrape' && /app.store/.test(item.endpoint)){
   const v=await call('inspect',{provider:item.provider,endpoint:item.endpoint});
   results.push({...meta,input:v.input,notes:v.notes});
  }else results.push(meta);
 }
 const out={configured:true,results};cached=out;return json(out);
});
