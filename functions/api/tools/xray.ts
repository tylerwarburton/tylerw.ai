// Every request fetches the selected policy and scores it live. No saved analyses.
import {
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
import { fetchPolicy, policyUrlFor } from '../_policy';

export const XRAY_QUESTIONS: Record<string, Question> = {
  sells: {
    type: 'noul',
    q: 'Does this clause say the company sells personal data, or "shares" it for targeted advertising?',
    hint: 'giving data to vendors or service providers who work for the company does not count',
  },
  third_party: { type: 'noul', q: 'Does it allow sharing personal data with third parties or partners?' },
  location: {
    type: 'noul',
    q: 'Does it collect precise location?',
    hint: 'GPS or precise device location; approximate location from an IP address does not count',
  },
  contacts: { type: 'noul', q: 'Does it collect your contacts or address book?' },
  biometrics: {
    type: 'noul',
    q: 'Does it collect face, voice or other biometric data?',
    hint: 'e.g. face scans, faceprints, voiceprints, fingerprints, voice recordings',
  },
  health: {
    type: 'noul',
    q: 'Does it collect health or fitness data?',
    hint: 'e.g. heart rate, steps, workouts, sleep, medical or menstrual data; safety or emergency disclosures do not count',
  },
  ai_training: { type: 'noul', q: 'Does it allow using your content to train AI models?' },
  retention: { type: 'noul', q: 'Does it keep data after you delete your account?' },
  tracking: { type: 'noul', q: 'Does it track you across other apps or websites?' },
  government: { type: 'noul', q: 'Does it allow disclosure to government or law enforcement on request?' },
  delete: { type: 'noul', q: 'Does it give you a way to delete your data?' },
  opt_out: { type: 'noul', q: 'Does it let you opt out of sale or targeted ads?' },
};

const GOOD = new Set(['delete', 'opt_out']);
const BATCH = 8;
export const XRAY_MODEL = 'openai/gpt-oss-120b';
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
  const { store: storeId } = await body<{ store?: string }>(request);
  const id = String(storeId ?? '');
  if (!/^\d{5,12}$/.test(id)) throw new HttpError(400, 'Search for an app and select it from the App Store results.');
  await rateLimit(env, `${device}:live-xray`, 6);
  await assertBudget(env);
  const { url, name } = await policyUrlFor(id);
  const { clauses, updated } = await fetchPolicy(url, env.JINA_API_KEY);
  const card = await score(env, { id: `as-${id}`, name: name || 'This app', category: 'App Store', url, updated, clauses });
  const s = await store(env);
  ctx.waitUntil(Promise.all([
    s.addEvent('xray', device, { app: `as-${id}`, name: card.name, risks: card.risks, riskTotal: card.riskTotal }, card.checks),
    s.incr('decisions', card.checks),
  ]));
  return json({ ...card, cached: false });
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
      [
        `These are consecutive clauses from the ${policy.name} privacy policy.`,
        'Judge each clause only on its own words: answer high only if that clause itself says the company does it (or lets you do it, for the delete and opt-out questions).',
        'A clause that says the company does NOT do something ("we do not sell your data") is a no for that question.',
        'Generic intros, headings and clauses on other topics are a no for every question.',
      ].join(' '),
      env.DEMO_XRAY_MODEL || XRAY_MODEL,
    ).then((r) => r.answers),
  );
  const perClause = results.flat();
  const model = env.DEMO_XRAY_MODEL || XRAY_MODEL;

  // Verify pass: a batch read can over-flag a clause, so each question's top
  // candidates are re-asked alone, one focused question at a time. A flag
  // stands only if a candidate is confirmed; the confirmed clause is the evidence.
  const rows = await pool(Object.keys(XRAY_QUESTIONS), 12, async (key) => {
    const ranked = perClause
      .map((a, i) => ({ i, p: a[key] as number }))
      .sort((x, y) => y.p - x.p);
    const candidates = ranked.filter((c) => c.p >= 0.5).slice(0, 3);
    let best = ranked[0] ?? { i: 0, p: 0 };
    if (candidates.length) {
      const verified = await judgeMany(
        env,
        candidates.map((c) => policy.clauses[c.i]),
        { [key]: XRAY_QUESTIONS[key] },
        [
          `Each item is one clause from the ${policy.name} privacy policy.`,
          'Be strict: answer high only if the clause itself clearly states this. Do not infer from related topics.',
          'A clause that says the company does NOT do it is a no.',
        ].join(' '),
        model,
      ).then((r) => r.answers.map((a, j) => ({ i: candidates[j].i, p: a[key] as number })));
      best = verified.sort((x, y) => y.p - x.p)[0];
    }
    return {
      key,
      good: GOOD.has(key),
      p: Math.max(0, best.p),
      clause: best.i,
      evidence: policy.clauses[best.i],
    };
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
