// POST /api/token  ->  a short-lived demo token for the Build panel.
// One per device, valid until midnight Eastern, capped at 2,000 calls.
import { deviceId, fail, handler, json, store } from './_lib';

export const CALL_CAP = 2000;

export const onRequestPost = handler(async ({ env, request }) => {
  const device = deviceId(request);
  if (device === 'anon') return fail(400, 'Missing device id.');
  const s = await store(env);

  const existing = await s.get(`dev:${device}`);
  if (existing) {
    const t = JSON.parse((await s.get(`tok:${existing}`)) ?? 'null');
    if (t && t.expires > Date.now()) return json(publicToken(existing, t));
  }

  const token = `tmx_${random(24)}`;
  const t = { device, expires: nextMidnightEastern(), cap: CALL_CAP };
  await s.set(`tok:${token}`, JSON.stringify(t));
  await s.set(`dev:${device}`, token);
  return json(publicToken(token, t));
});

function publicToken(token: string, t: { expires: number; cap: number }) {
  return { token, expires: t.expires, cap: t.cap };
}

function random(n: number) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

/** Epoch ms of the next midnight in America/New_York (handles DST). */
function nextMidnightEastern() {
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const elapsed = ((Number(parts.hour) % 24) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000;
  return now.getTime() - elapsed + 86_400_000;
}
