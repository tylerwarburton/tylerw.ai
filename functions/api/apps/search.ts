// GET /api/apps/search?q=  ->  App Store matches for the any-app X-ray.
import { deviceId, fail, handler, json, rateLimit } from '../_lib';
import { searchApps } from '../_policy';

export const onRequestGet = handler(async ({ env, request }) => {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 60);
  if (q.length < 2) return fail(400, 'Type at least two letters.');
  await rateLimit(env, `${deviceId(request)}:search`, 60);
  return json({ apps: await searchApps(q) }, 200, { 'cache-control': 'public, max-age=300' });
});
