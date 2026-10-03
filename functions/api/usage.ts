import { deviceId, handler, HttpError, json, store } from './_lib';
export const onRequestGet = handler(async ({request,env}) => {
  const id = deviceId(request);
  if (id === 'anon') throw new HttpError(400,'Session identifier required.');
  const s = await store(env);
  const keys = ['costUsd','calls','pricedCalls','inputTokens','outputTokens','elapsedMs','runs','decisions','jevDecisions','jevSpend','textSpend'];
  const totals = Object.fromEntries(await Promise.all(keys.map(async k => [k,Number(await s.get(`usage:${id}:${k}`) || 0)])));
  return json({...totals,costComplete:totals.calls === totals.pricedCalls});
});
