import { deviceId, handler, HttpError, json, store, readMany } from './_lib';
export const onRequestGet = handler(async ({request,env}) => {
  const id = deviceId(request);
  if (id === 'anon') throw new HttpError(400,'Session identifier required.');
  const s = await store(env);
  const keys = ['costUsd','calls','pricedCalls','inputTokens','outputTokens','elapsedMs','runs','decisions','jevDecisions','jevSpend','textSpend','dataSpend'];
  const values=await readMany(s,keys.map(k=>`usage:${id}:${k}`));
  const totals=Object.fromEntries(keys.map(k=>[k,Number(values[`usage:${id}:${k}`]||0)]));
  return json({...totals,costComplete:totals.calls === totals.pricedCalls});
});
