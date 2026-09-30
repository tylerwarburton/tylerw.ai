// POST /api/tools/scam  { text }  ->  verdict, likelihood, type, flags
// One model call answers all 12 questions at once. The message text is never
// stored or logged; only the type, verdict band and flags reach the wall.
import { assertBudget, body, deviceId, handler, HttpError, json, judge, rateLimit, store, top, type Question } from '../_lib';

const KINDS = [
  'toll or road fee',
  'package delivery',
  'bank or card alert',
  'account or password',
  'fake job',
  'crypto or investment',
  'wrong number or romance',
  'prize or lottery',
  'tech support',
  'government or IRS',
  'invoice or payment',
  'legitimate',
];

const WANTS = ['click a link', 'reply', 'call a number', 'pay money', 'share a code or password', 'nothing'];

export const SCAM_QUESTIONS: Record<string, Question> = {
  scam: {
    type: 'noul',
    q: 'Is this message a scam or phishing attempt?',
    hint: 'yes = it tries to deceive the reader for money, data or access',
  },
  kind: { type: 'choice', q: 'What kind of message is this?', options: KINDS },
  wants: { type: 'choice', q: 'What does it want the reader to do?', options: WANTS },
  pressure: {
    type: 'score',
    q: 'How much urgency or pressure does it apply?',
    levels: ['none', 'mild', 'clear deadline', 'threat of loss', 'extreme'],
  },
  f_link: { type: 'noul', q: 'Does it contain a lookalike or mismatched link?' },
  f_brand: { type: 'noul', q: 'Does it impersonate a known company or agency?' },
  f_money: { type: 'noul', q: 'Does it ask for payment or gift cards?' },
  f_creds: { type: 'noul', q: 'Does it ask for a code, password or personal info?' },
  f_urgent: { type: 'noul', q: 'Does it threaten a penalty or deadline?' },
  f_unexpected: { type: 'noul', q: 'Would a typical person not be expecting this?' },
  f_odd: { type: 'noul', q: 'Is the wording, grammar or formatting unusual?' },
  f_channel: { type: 'noul', q: 'Is this an unusual channel for the sender it claims to be?' },
};

export const FLAG_LABELS: Record<string, string> = {
  f_link: 'Lookalike link',
  f_brand: 'Impersonates a brand',
  f_money: 'Asks for payment',
  f_creds: 'Asks for a code or info',
  f_urgent: 'Deadline or threat',
  f_unexpected: 'Unexpected',
  f_odd: 'Odd wording',
  f_channel: 'Wrong channel',
};

export const onRequestPost = handler(async (ctx) => {
  const { env, request } = ctx;
  const device = deviceId(request);
  const { text } = await body<{ text?: string }>(request, 12_000);
  const input = (text ?? '').trim();
  if (input.length < 8) throw new HttpError(400, 'Paste a message first.');
  if (input.length > 4000) throw new HttpError(413, 'That message is too long. Paste the first part.');

  await rateLimit(env, device);
  await assertBudget(env);

  const r = await judge(env, input, SCAM_QUESTIONS, 'Judge this text message, email or DM that someone received.');
  const a = r.answers;
  const p = a.scam as number;
  const band = p >= 0.75 ? 'scam' : p <= 0.25 ? 'legit' : 'unsure';
  const flags = Object.keys(FLAG_LABELS)
    .map((k) => ({ key: k, label: FLAG_LABELS[k], p: a[k] as number }))
    .filter((f) => f.p > 0.6)
    .sort((x, y) => y.p - x.p);
  const [kind, kindP] = top(a.kind);
  const [wants] = top(a.wants);

  const decisions = Object.keys(SCAM_QUESTIONS).length;
  const s = await store(env);
  ctx.waitUntil(
    Promise.all([
      s.addEvent('scam', device, { kind, band, flags: flags.map((f) => f.key) }, decisions),
      s.incr('decisions', decisions),
    ]),
  );

  return json({
    band,
    likelihood: p,
    kind: { top: kind, p: kindP, dist: a.kind },
    wants,
    pressure: a.pressure,
    flags,
    checks: decisions,
    ms: r.ms,
    model: r.model,
  });
});
