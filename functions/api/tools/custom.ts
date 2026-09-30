// POST /api/tools/custom  { text, questions: [{ type, q, options? }] }
// "Make your own check": attendees write up to four questions of their own,
// using the same three primitives, about a short piece of their own text.
// Bounded (short input, few questions, numbers out) so it can't be used as a
// free general-purpose chat API.
import { assertBudget, body, deviceId, handler, HttpError, json, judge, rateLimit, store, type Question } from '../_lib';

interface In {
  text?: string;
  questions?: { type?: string; q?: string; options?: string[] }[];
}

const LEVELS = ['very low', 'low', 'medium', 'high', 'very high'];

export const onRequestPost = handler(async (ctx) => {
  const { env, request } = ctx;
  const device = deviceId(request);
  const input = await body<In>(request, 16_000);
  const text = (input.text ?? '').trim();
  if (text.length < 2) throw new HttpError(400, 'Add some text to check.');
  if (text.length > 3000) throw new HttpError(413, 'Keep the text under 3,000 characters for the demo.');

  const qs = (input.questions ?? []).filter((q) => (q.q ?? '').trim()).slice(0, 4);
  if (!qs.length) throw new HttpError(400, 'Write at least one question.');

  const questions: Record<string, Question> = {};
  qs.forEach((q, i) => {
    const prompt = String(q.q).trim().slice(0, 240);
    const key = `q${i}`;
    if (q.type === 'choice') {
      const options = (q.options ?? []).map((o) => String(o).trim().slice(0, 60)).filter(Boolean).slice(0, 8);
      if (options.length < 2) throw new HttpError(400, `Question ${i + 1} needs at least two options.`);
      questions[key] = { type: 'choice', q: prompt, options };
    } else if (q.type === 'score') {
      questions[key] = { type: 'score', q: prompt, levels: LEVELS };
    } else {
      questions[key] = { type: 'noul', q: prompt };
    }
  });

  await rateLimit(env, device);
  await assertBudget(env);
  const r = await judge(env, text, questions);

  const decisions = Object.keys(questions).length;
  const s = await store(env);
  ctx.waitUntil(Promise.all([s.addEvent('custom', device, { n: decisions }, decisions), s.incr('decisions', decisions)]));
  return json({ answers: qs.map((_, i) => r.answers[`q${i}`]), checks: decisions, ms: r.ms, model: r.model });
});
