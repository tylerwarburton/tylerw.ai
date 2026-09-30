// Shared core for the /demo API (Cloudflare Pages Functions).
//
// Everything that touches the OpenRouter key lives here. The tools build
// their own questions server-side, so the playground endpoints can't be used
// as a free general-purpose API; the only open-ended surface is the
// token-gated /api/v1 passthrough, which is capped per token.

export interface Env {
  OPENROUTER_API_KEY: string;
  /** Primary fast model, e.g. "openai/gpt-oss-120b". */
  DEMO_MODEL?: string;
  /** Comma-separated fallbacks OpenRouter tries if the primary fails. */
  DEMO_FALLBACK_MODELS?: string;
  /** Models attendees may pick in the passthrough. Comma-separated. */
  DEMO_ALLOWED_MODELS?: string;
  /** Soft spend cap in USD; the key's own OpenRouter limit is the hard cap. */
  DEMO_SPEND_CAP?: string;
  /** Secret for presenter actions on the wall (freeze/reset). */
  DEMO_ADMIN_KEY?: string;
  /** D1 database for tokens, spend and the room wall. */
  DEMO_DB?: D1Database;
  ASSETS: { fetch: typeof fetch };
}

export type Ctx = EventContext<Env, string, unknown>;

export const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';

// — HTTP helpers —————————————————————————————————————————————

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

export function fail(status: number, message: string, extra: Record<string, unknown> = {}) {
  return json({ error: message, ...extra }, status);
}

export async function body<T>(req: Request, maxBytes = 64_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'That input is too long for the demo.');
  try {
    return JSON.parse(text || '{}') as T;
  } catch {
    throw new HttpError(400, 'Request body must be JSON.');
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Wrap a handler so HttpErrors become clean JSON responses. */
export function handler(fn: (ctx: Ctx) => Promise<Response>) {
  return async (ctx: Ctx) => {
    try {
      return await fn(ctx);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
      console.error(e);
      return fail(500, 'Something went wrong. Try again in a moment.');
    }
  };
}

export function deviceId(req: Request): string {
  const d = req.headers.get('x-device-id') || '';
  return /^[a-z0-9-]{8,64}$/i.test(d) ? d : 'anon';
}

// — Storage: D1 when bound, in-memory otherwise (local dev) ——————

export interface Store {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
  incr(k: string, by: number): Promise<number>;
  addEvent(tool: string, device: string, data: unknown, decisions: number): Promise<void>;
  events(): Promise<{ tool: string; device: string; data: string; decisions: number; ts: number }[]>;
  clearEvents(): Promise<void>;
}

const mem = new Map<string, string>();
const memEvents: { tool: string; device: string; data: string; decisions: number; ts: number }[] = [];

const memoryStore: Store = {
  async get(k) {
    return mem.get(k) ?? null;
  },
  async set(k, v) {
    mem.set(k, v);
  },
  async incr(k, by) {
    const n = Number(mem.get(k) ?? 0) + by;
    mem.set(k, String(n));
    return n;
  },
  async addEvent(tool, device, data, decisions) {
    memEvents.push({ tool, device, data: JSON.stringify(data), decisions, ts: Date.now() });
  },
  async events() {
    return memEvents;
  },
  async clearEvents() {
    memEvents.length = 0;
  },
};

let schemaReady = false;
async function d1Store(db: D1Database): Promise<Store> {
  if (!schemaReady) {
    await db.batch([
      db.prepare('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)'),
      db.prepare(
        'CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, tool TEXT NOT NULL, device TEXT NOT NULL, data TEXT NOT NULL, decisions INTEGER NOT NULL)',
      ),
    ]);
    schemaReady = true;
  }
  return {
    async get(k) {
      const r = await db.prepare('SELECT v FROM kv WHERE k = ?').bind(k).first<{ v: string }>();
      return r?.v ?? null;
    },
    async set(k, v) {
      await db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v).run();
    },
    async incr(k, by) {
      const r = await db
        .prepare(
          "INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = CAST(CAST(v AS REAL) + CAST(excluded.v AS REAL) AS TEXT) RETURNING v",
        )
        .bind(k, String(by))
        .first<{ v: string }>();
      return Number(r?.v ?? by);
    },
    async addEvent(tool, device, data, decisions) {
      await db
        .prepare('INSERT INTO events (ts, tool, device, data, decisions) VALUES (?, ?, ?, ?, ?)')
        .bind(Date.now(), tool, device, JSON.stringify(data), decisions)
        .run();
    },
    async events() {
      const r = await db.prepare('SELECT tool, device, data, decisions, ts FROM events ORDER BY id').all();
      return (r.results ?? []) as never;
    },
    async clearEvents() {
      await db.prepare('DELETE FROM events').run();
    },
  };
}

export async function store(env: Env): Promise<Store> {
  return env.DEMO_DB ? d1Store(env.DEMO_DB) : memoryStore;
}

// — Guardrails —————————————————————————————————————————————

export function spendCap(env: Env) {
  return Number(env.DEMO_SPEND_CAP ?? 45);
}

export async function assertBudget(env: Env) {
  const s = await store(env);
  const spent = Number((await s.get('spend')) ?? 0);
  if (spent >= spendCap(env)) {
    throw new HttpError(402, 'Demo budget reached. Thanks for playing! Everything on this page still works on your own key.');
  }
}

/** Fixed-window rate limit per device (30 tool runs a minute by default). */
export async function rateLimit(env: Env, device: string, limit = 30) {
  const s = await store(env);
  const window = Math.floor(Date.now() / 60_000);
  const n = await s.incr(`rl:${device}:${window}`, 1);
  if (n > limit) throw new HttpError(429, 'Slow down a little: try again in a few seconds.', { retryAfter: 5 });
}

// — OpenRouter —————————————————————————————————————————————

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
}

export function models(env: Env) {
  const primary = env.DEMO_MODEL || DEFAULT_MODEL;
  const fallbacks = (env.DEMO_FALLBACK_MODELS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { primary, fallbacks };
}

export async function recordSpend(env: Env, usage: Usage | undefined) {
  if (!usage?.cost) return;
  const s = await store(env);
  await s.incr('spend', usage.cost);
}

/**
 * One chat completion against OpenRouter with a JSON-schema response.
 * Retries 429/5xx with jittered backoff, since a whole room hits it at once.
 */
export async function completeJson<T>(
  env: Env,
  opts: { system: string; user: string; schema: object; maxTokens?: number },
): Promise<{ data: T; usage?: Usage; model: string; ms: number }> {
  if (!env.OPENROUTER_API_KEY) throw new HttpError(503, 'Demo is not configured yet (no API key).');
  const { primary, fallbacks } = models(env);
  const payload = {
    model: primary,
    ...(fallbacks.length ? { models: [primary, ...fallbacks] } : {}),
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    temperature: 0,
    max_tokens: opts.maxTokens ?? 1200,
    reasoning: { effort: 'low', exclude: true },
    response_format: { type: 'json_schema', json_schema: { name: 'answers', strict: true, schema: opts.schema } },
    provider: { sort: 'latency', require_parameters: true },
    usage: { include: true },
  };
  const started = Date.now();
  let lastErr = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(OPENROUTER, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'content-type': 'application/json',
        'HTTP-Referer': 'https://tylerw.ai/demo',
        'X-Title': 'tylerw.ai demo',
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const out = (await res.json()) as {
        model: string;
        usage?: Usage;
        choices?: { message?: { content?: string } }[];
      };
      const text = out.choices?.[0]?.message?.content ?? '';
      await recordSpend(env, out.usage);
      try {
        return { data: JSON.parse(extractJson(text)) as T, usage: out.usage, model: out.model, ms: Date.now() - started };
      } catch {
        lastErr = 'model returned malformed JSON';
        continue;
      }
    }
    lastErr = `${res.status} ${(await res.text()).slice(0, 200)}`;
    if (res.status === 402) throw new HttpError(402, 'Demo budget reached. Thanks for playing!');
    if (res.status !== 429 && res.status < 500) break;
    await sleep(300 * 2 ** attempt + Math.random() * 400);
  }
  console.error('openrouter failed:', lastErr);
  throw new HttpError(503, 'The room is busy. Trying again in a moment usually works.', { retryAfter: 2 });
}

function extractJson(text: string) {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) return t;
  const m = t.match(/\{[\s\S]*\}/);
  return m ? m[0] : t;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run async jobs with bounded concurrency, preserving order. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// — The three question primitives ——————————————————————————————
//   Noul   : probability a statement is true            -> number 0..1
//   Choice : probability over a fixed set of options    -> {option: p}
//   Score  : probability over levels 1..5               -> {1..5: p}

export type Question =
  | { type: 'noul'; q: string; hint?: string }
  | { type: 'choice'; q: string; options: string[] }
  | { type: 'score'; q: string; levels: string[] };

export type Answer = number | Record<string, number>;

export const JUDGE_SYSTEM = [
  'You are System 1: a fast, calibrated judgment engine.',
  'For every question, answer with probabilities, not prose.',
  '- yes/no questions: the probability (0 to 1) that the answer is yes.',
  '- choice and score questions: a probability for every option, summing to 1.',
  'Be calibrated: use values near 0 or 1 only when the evidence is clear; use the middle when it is genuinely ambiguous.',
  'Return only JSON that matches the schema.',
].join('\n');

/** JSON schema for one set of answers, keyed by question key. */
export function answerSchema(questions: Record<string, Question>) {
  const properties: Record<string, object> = {};
  for (const [k, q] of Object.entries(questions)) {
    if (q.type === 'noul') properties[k] = { type: 'number' };
    else {
      const opts = q.type === 'choice' ? q.options : q.levels.map((_, i) => String(i + 1));
      properties[k] = {
        type: 'object',
        properties: Object.fromEntries(opts.map((o, i) => [`o${i}`, { type: 'number' }])),
        required: opts.map((_, i) => `o${i}`),
        additionalProperties: false,
      };
    }
  }
  return { type: 'object', properties, required: Object.keys(questions), additionalProperties: false };
}

/** Human-readable question list for the prompt. */
export function describe(questions: Record<string, Question>) {
  return Object.entries(questions)
    .map(([k, q]) => {
      if (q.type === 'noul') return `${k} (yes/no): ${q.q}${q.hint ? ` (${q.hint})` : ''}`;
      if (q.type === 'choice') return `${k} (choice): ${q.q}\n${q.options.map((o, i) => `   o${i} = ${o}`).join('\n')}`;
      return `${k} (score 1-5): ${q.q}\n${q.levels.map((l, i) => `   o${i} = ${i + 1}: ${l}`).join('\n')}`;
    })
    .join('\n');
}

/** Map raw model output back to real option names, clamped and normalized. */
export function normalize(questions: Record<string, Question>, raw: Record<string, unknown>) {
  const out: Record<string, Answer> = {};
  for (const [k, q] of Object.entries(questions)) {
    const v = raw?.[k];
    if (q.type === 'noul') {
      out[k] = clamp01(Number(v));
      continue;
    }
    const opts = q.type === 'choice' ? q.options : q.levels.map((_, i) => String(i + 1));
    const obj = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const ps = opts.map((_, i) => Math.max(0, Number(obj[`o${i}`]) || 0));
    const sum = ps.reduce((a, b) => a + b, 0) || 1;
    out[k] = Object.fromEntries(opts.map((o, i) => [o, ps[i] / sum]));
  }
  return out;
}

function clamp01(n: number) {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}

/** Ask a set of questions about one input in a single call. */
export async function judge(env: Env, input: string, questions: Record<string, Question>, context = '') {
  const r = await completeJson<Record<string, unknown>>(env, {
    system: JUDGE_SYSTEM,
    user: `${context ? `${context}\n\n` : ''}INPUT:\n"""\n${input}\n"""\n\nQUESTIONS:\n${describe(questions)}`,
    schema: answerSchema(questions),
    maxTokens: 900,
  });
  return { answers: normalize(questions, r.data), usage: r.usage, model: r.model, ms: r.ms };
}

/**
 * Ask the same yes/no-style questions of many short items in one call.
 * Returns one answer map per item, in order.
 */
export async function judgeMany(
  env: Env,
  items: string[],
  questions: Record<string, Question>,
  context: string,
) {
  const itemSchema = answerSchema(questions) as { properties: Record<string, object>; required: string[] };
  const schema = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: { i: { type: 'integer' }, ...itemSchema.properties },
          required: ['i', ...itemSchema.required],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  };
  const r = await completeJson<{ items: Record<string, unknown>[] }>(env, {
    system: JUDGE_SYSTEM,
    user: `${context}\n\nAnswer every question for EVERY numbered item. Return one entry per item with its number as "i".\n\nQUESTIONS:\n${describe(questions)}\n\nITEMS:\n${items
      .map((t, i) => `[${i}] ${t}`)
      .join('\n')}`,
    schema,
    maxTokens: 400 + items.length * Object.keys(questions).length * 14,
  });
  const byIndex = new Map<number, Record<string, unknown>>();
  for (const it of r.data.items ?? []) byIndex.set(Number(it.i), it);
  const answers = items.map((_, i) => normalize(questions, byIndex.get(i) ?? {}));
  return { answers, usage: r.usage, model: r.model, ms: r.ms };
}

export function top(dist: Answer): [string, number] {
  if (typeof dist === 'number') return ['yes', dist];
  return Object.entries(dist).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
}

/** Expected value of a 1..5 score distribution. */
export function expected(dist: Answer): number {
  if (typeof dist === 'number') return dist;
  return Object.entries(dist).reduce((a, [k, p]) => a + Number(k) * p, 0);
}

/** Read a JSON file shipped under /public via the static asset binding. */
export async function asset<T>(ctx: Ctx, path: string): Promise<T | null> {
  const url = new URL(path, ctx.request.url);
  const res = await ctx.env.ASSETS.fetch(url.toString());
  if (!res.ok) return null;
  const type = res.headers.get('content-type') || '';
  if (!type.includes('json')) return null;
  return (await res.json()) as T;
}
