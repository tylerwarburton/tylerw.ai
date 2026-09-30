// POST /api/tools/xray  { app }  ->  12-question scorecard with quoted evidence
// Every clause of the app's privacy policy is asked all 12 questions. Clauses
// go out in batches, many batches at once. The app-level answer is the
// highest-probability clause, and that clause is the evidence.
//
// Results are cached per app + policy date: first in a pre-built static file
// (warmed before the event), then in the store. A cached run still reports
// the real counts, and the page plays the counter.
import {
  asset,
  assertBudget,
  body,
  deviceId,
  handler,
  HttpError,
  json,
  judgeMany,
  pool,
  rateLimit,
  store,
  type Question,
} from '../_lib';

export const XRAY_QUESTIONS: Record<string, Question> = {
  sells: { type: 'noul', q: 'Does this clause allow selling or "sharing" personal data for advertising?' },
  third_party: { type: 'noul', q: 'Does it allow sharing personal data with third parties or partners?' },
  location: { type: 'noul', q: 'Does it collect precise location?' },
  contacts: { type: 'noul', q: 'Does it collect your contacts or address book?' },
  biometrics: { type: 'noul', q: 'Does it collect face, voice or other biometric data?' },
  health: { type: 'noul', q: 'Does it collect health or fitness data?' },
  ai_training: { type: 'noul', q: 'Does it allow using your content to train AI models?' },
  retention: { type: 'noul', q: 'Does it keep data after you delete your account?' },
  tracking: { type: 'noul', q: 'Does it track you across other apps or websites?' },
  government: { type: 'noul', q: 'Does it allow disclosure to government or law enforcement on request?' },
  delete: { type: 'noul', q: 'Does it give you a way to delete your data?' },
  opt_out: { type: 'noul', q: 'Does it let you opt out of sale or targeted ads?' },
};

const GOOD = new Set(['delete', 'opt_out']);
const BATCH = 12;
const CONCURRENCY = 20;

interface Policy {
  id: string;
  name: string;
  category: string;
  url: string;
  updated: string;
  clauses: string[];
}

export interface Scorecard {
  app: string;
  name: string;
  url: string;
  updated: string;
  clauses: number;
  checks: number;
  ms: number;
  rows: { key: string; good: boolean; p: number; clause: number; evidence: string }[];
  risks: number;
  riskTotal: number;
}

export const onRequestPost = handler(async (ctx) => {
  const { env, request } = ctx;
  const device = deviceId(request);
  const { app } = await body<{ app?: string }>(request);
  if (!app || !/^[a-z0-9-]{1,40}$/.test(app)) throw new HttpError(400, 'Pick an app.');

  const policy = await asset<Policy>(ctx, `/demo-data/xray/${app}.json`);
  if (!policy?.clauses?.length) throw new HttpError(404, 'We do not have that policy loaded.');

  await rateLimit(env, device);
  const s = await store(env);
  const cacheKey = `xray:${app}:${policy.updated}`;

  let card =
    (await asset<Scorecard>(ctx, `/demo-data/xray/results/${app}.json`).then((c) =>
      c && c.updated === policy.updated ? c : null,
    )) ?? (JSON.parse((await s.get(cacheKey)) ?? 'null') as Scorecard | null);
  const cached = !!card;

  if (!card) {
    await assertBudget(env);
    card = await score(env, policy);
    await s.set(cacheKey, JSON.stringify(card));
  }

  ctx.waitUntil(
    Promise.all([
      s.addEvent('xray', device, { app, name: policy.name, risks: card.risks, riskTotal: card.riskTotal }, card.checks),
      s.incr('decisions', card.checks),
    ]),
  );
  return json({ ...card, cached });
});

export async function score(env: Parameters<typeof judgeMany>[0], policy: Policy): Promise<Scorecard> {
  const started = Date.now();
  const batches: string[][] = [];
  for (let i = 0; i < policy.clauses.length; i += BATCH) batches.push(policy.clauses.slice(i, i + BATCH));

  const results = await pool(batches, CONCURRENCY, (clauses) =>
    judgeMany(
      env,
      clauses,
      XRAY_QUESTIONS,
      `These are consecutive clauses from the ${policy.name} privacy policy. Judge each clause on its own words: answer yes only if that clause itself says it.`,
    ).then((r) => r.answers),
  );
  const perClause = results.flat();

  const rows = Object.keys(XRAY_QUESTIONS).map((key) => {
    let best = 0;
    let bestP = -1;
    perClause.forEach((a, i) => {
      const p = a[key] as number;
      if (p > bestP) {
        bestP = p;
        best = i;
      }
    });
    return { key, good: GOOD.has(key), p: Math.max(0, bestP), clause: best, evidence: policy.clauses[best] };
  });
  const riskRows = rows.filter((r) => !r.good);
  return {
    app: policy.id,
    name: policy.name,
    url: policy.url,
    updated: policy.updated,
    clauses: policy.clauses.length,
    checks: policy.clauses.length * rows.length,
    ms: Date.now() - started,
    rows,
    risks: riskRows.filter((r) => r.p >= 0.6).length,
    riskTotal: riskRows.length,
  };
}
