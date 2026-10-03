// Temporary, fixed, non-billable catalog diagnostic. Never returns credentials.
import {handler,json,rateLimit,deviceId,HttpError} from '../_lib';
let cached:unknown;
export const onRequestGet=handler(async({env,request})=>{
 await rateLimit({...env,ROOM:undefined,DEMO_DB:undefined},`${deviceId(request)}:provider-check`,3);
 const key=env.MONID_API_KEY || await env.MONID_SECRET?.get().catch(()=>undefined);
 if(!key)return json({configured:false});

 async function call(path:string,input:unknown){
  const r=await fetch(`https://api.monid.ai/v1/${path}`,{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new HttpError(502,`Monid catalog returned HTTP ${r.status}.`);
  return await r.json() as any;
 }
 if(new URL(request.url).searchParams.get('test')==='1'){
  const token=request.headers.get('x-provider-test')||'';
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!=='f880104bf8684c2631730efa4335a0c6e1a319654ff88d5a04734f2bfc186523')throw new HttpError(403,'Forbidden');
  const search=await call('run',{provider:'litescrape',endpoint:'/app-store/search',input:{queryParams:{term:'X',country:'us',num:3}}});
  const product=await call('run',{provider:'litescrape',endpoint:'/app-store/product',input:{queryParams:{product_id:'333903271',country:'us'}}});
  return json({search,product});
 }
 if(cached)return json(cached);
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
