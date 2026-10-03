// Token-gated native decision API for attendees. The real key never leaves the Worker.
import {assertBudget,body,decide,handler,HttpError,JEV_MODEL,json,store,type RunMeter,type DecisionQuestion} from '../_lib';

export const onRequestPost=handler(async({env,request})=>{
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!token.startsWith('tmx_'))throw new HttpError(401,'Use your demo token from the Build panel.');
  const s=await store(env);
  const t=JSON.parse(await s.get(`tok:${token}`)||'null') as {device:string;expires:number;cap:number}|null;
  if(!t || t.expires<Date.now())throw new HttpError(401,'This demo token is unknown or expired. Open Build for a new token.');
  const input=await body<{model?:string;state?:unknown;questions?:Record<string,DecisionQuestion>}>(request,90000);
  if(input.model && input.model!==JEV_MODEL)throw new HttpError(400,`This endpoint serves ${JEV_MODEL}.`);
  if(input.state===undefined || !input.questions || Array.isArray(input.questions) || typeof input.questions!=='object')throw new HttpError(400,'Provide state and a questions object.');
  const entries=Object.entries(input.questions);
  if(!entries.length || entries.length>32)throw new HttpError(400,'Use between 1 and 32 questions.');
  for(const [key,q] of entries) {
    if(key.length>100 || !q || !['noul','choice','score'].includes(q.type))throw new HttpError(400,'Use noul, choice or score questions.');
    if(q.type==='choice' && (!q.criteria || Array.isArray(q.criteria) || typeof q.criteria!=='object' || Object.keys(q.criteria).length<2 || Object.keys(q.criteria).length>255))throw new HttpError(400,'Choice criteria need 2–255 named options.');
    if(q.type==='score' && (!Array.isArray(q.criteria) || q.criteria.length<2 || q.criteria.length>20))throw new HttpError(400,'Score criteria need 2–20 ordered levels.');
  }
  if(await s.incr(`calls:${token}`,1)>t.cap)throw new HttpError(429,'This demo token has reached its call limit.');
  await assertBudget(env);
  const local={...env,RUN_METER:{costUsd:0,calls:0,pricedCalls:0,inputTokens:0,outputTokens:0} as RunMeter};
  const started=Date.now();
  try {
    const result=await decide(local,input.state,input.questions);
    await s.incr('decisions',entries.length);
    return json({...result,runUsage:{...local.RUN_METER,elapsedMs:Date.now()-started,costComplete:local.RUN_METER.calls===local.RUN_METER.pricedCalls}});
  } finally {
    await Promise.all(Object.entries({...local.RUN_METER,jevDecisions:(local.RUN_METER.stages||[]).reduce((n,s)=>n+s.decisions,0),jevSpend:local.RUN_METER.costUsd,decisions:(local.RUN_METER.stages||[]).reduce((n,s)=>n+s.decisions,0),runs:1,elapsedMs:Date.now()-started}).filter((x):x is [string,number]=>typeof x[1]==='number').map(([k,v])=>s.incr(`usage:${t.device}:${k}`,v)));
  }
});
