// GET  /api/wall  ->  room totals for the projector (polled about once a second)
// POST /api/wall  { action: "freeze" | "unfreeze" | "reset", key }  (presenter)
// Nothing personal is returned: no message text, no device ids, no names.
import { body, fail, handler, json, spendCap, store, type Env } from './_lib';

interface Ev {
  tool: string;
  device: string;
  data: string;
  decisions: number;
  ts: number;
}

export async function aggregate(env: Env) {
  const s = await store(env);
  const events = (await s.events()) as Ev[];
  const decisions = Number((await s.get('decisions')) ?? 0);
  const spent = Number((await s.get('spend')) ?? 0);

  const people = new Set(events.map((e) => e.device)).size;
  const scamKinds: Record<string, number> = {};
  let scamTotal = 0;
  let unsure = 0;
  const apps: Record<string, { name: string; n: number; risks: number; riskTotal: number }> = {};
  const recentApps: string[] = [];
  const splits: Record<string, number>[] = [];
  let mostExposed: { title: string; exposure: number } | null = null;
  const borderline: string[] = [];
  let custom = 0;

  for (const e of events) {
    const d = JSON.parse(e.data);
    if (e.tool === 'scam') {
      scamTotal++;
      scamKinds[d.kind] = (scamKinds[d.kind] ?? 0) + 1;
      if (d.band === 'unsure') unsure++;
    } else if (e.tool === 'xray') {
      const a = (apps[d.app] ??= { name: d.name, n: 0, risks: d.risks, riskTotal: d.riskTotal });
      a.n++;
      recentApps.unshift(d.app);
    } else if (e.tool === 'jobs') {
      splits.push(d.split);
      if (!mostExposed || d.exposure > mostExposed.exposure) mostExposed = { title: d.title, exposure: d.exposure };
      for (const t of d.borderline ?? []) if (!borderline.includes(t)) borderline.push(t);
    } else if (e.tool === 'custom') custom++;
  }

  const appList = Object.entries(apps).map(([id, a]) => ({ id, ...a }));
  const worst = [...appList].sort((a, b) => b.risks - a.risks)[0] ?? null;
  const avgSplit = splits.length
    ? Object.fromEntries(
        ['Automate', 'Augment', 'Own'].map((k) => [k, splits.reduce((a, s) => a + (s[k] ?? 0), 0) / splits.length]),
      )
    : null;

  return {
    totals: { jevDecisions:Number(await s.get('jevDecisions')||0),jevSpend:Number(await s.get('jevSpend')||0),textSpend:Number(await s.get('textSpend')||0), decisions, people, spent, cap: spendCap(env), runs: events.length },
    scam: {
      total: scamTotal,
      unsure,
      kinds: Object.entries(scamKinds)
        .map(([kind, n]) => ({ kind, n }))
        .sort((a, b) => b.n - a.n),
    },
    xray: {
      apps: appList.sort((a, b) => b.n - a.n).slice(0, 8),
      worst,
      recent: [...new Set(recentApps)].slice(0, 8),
    },
    jobs: { runs: splits.length, avgSplit, mostExposed, borderline: borderline.slice(-5).reverse() },
    custom,
    updated: Date.now(),
  };
}

export const onRequestGet = handler(async ({ env }) => {
  const s = await store(env);
  const frozen = await s.get('wall:frozen');
  if (frozen) return json({ ...JSON.parse(frozen), frozen: true });
  return json({ ...(await aggregate(env)), frozen: false });
});

export const onRequestPost = handler(async ({ env, request }) => {
  const { action, key } = await body<{ action?: string; key?: string }>(request);
  if (!env.DEMO_ADMIN_KEY || key !== env.DEMO_ADMIN_KEY) return fail(403, 'Presenter key required.');
  const s = await store(env);
  if (action === 'freeze') await s.set('wall:frozen', JSON.stringify(await aggregate(env)));
  else if (action === 'unfreeze') await s.set('wall:frozen', '');
  else if (action === 'reset') {
    await s.clearEvents();
    await Promise.all([s.set('decisions', '0'), s.set('jevDecisions','0'), s.set('wall:frozen', '')]);
  } else return fail(400, 'Unknown action.');
  return json({ ok: true, action });
});
