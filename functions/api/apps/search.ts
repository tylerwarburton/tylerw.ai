// GET /api/apps/search?q=  ->  App Store matches for the any-app X-ray.
import { deviceId, fail, handler, json, rateLimit, store, HttpError } from '../_lib';
import { searchApps } from '../_policy';

export const onRequestGet = handler(async ({ env, request }) => {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 60);
  if (q.length < 1) return fail(400, 'Type an app name.');
  // Public, non-inference search must not depend on room analytics storage.
  try { await rateLimit(env, `${deviceId(request)}:search`, 60); }
  catch(error) { if(!(error instanceof HttpError) || !String(error.extra.code||'').startsWith('ROOM_'))throw error;
    await rateLimit({...env,ROOM:undefined,DEMO_DB:undefined},`${deviceId(request)}:search`,60);
  }
  const s = await store(env);
  const key = `app-search-v2:${q.toLowerCase()}`;
  const cached = JSON.parse((await s.get(key).catch(()=>null)) ?? 'null');
  if (cached?.expires > Date.now()) return json({ apps: cached.apps });
  const apps = await searchApps(q, env.JINA_API_KEY);
  await s.set(key, JSON.stringify({ apps, expires: Date.now() + 3600_000 })).catch(()=>undefined);
  return json({ apps });
});
