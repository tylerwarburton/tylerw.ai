// POST /api/v1/chat/completions: OpenAI-compatible passthrough for builders.
// Auth is a demo token from /api/token (never the real key). Each token is
// capped in calls and expires at midnight; the model is limited to the demo's
// fast models and output length is capped. Streaming is supported.
import { assertBudget, fail, handler, models, reasoningFor, recordModelCall, store, type Env, type Usage } from '../../_lib';

const MAX_OUT = 4096;

export function allowedModels(env: Env) {
  const { primary, fallbacks } = models(env);
  const extra = (env.DEMO_ALLOWED_MODELS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks, ...extra])];
}

export const onRequestPost = handler(async (ctx) => {
  const { env, request } = ctx;
  if (!env.OPENROUTER_API_KEY) return fail(501, 'Live AI is not switched on yet. Please ask the presenter to enable it.');
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token.startsWith('tmx_')) return fail(401, 'Use your demo token from tylerw.ai/demo as the API key.');

  const s = await store(env);
  const t = JSON.parse((await s.get(`tok:${token}`)) ?? 'null') as { expires: number; cap: number } | null;
  if (!t) return fail(401, 'Unknown demo token. Get one at tylerw.ai/demo.');
  if (t.expires < Date.now()) return fail(401, 'This demo token has expired. Thanks for building!');
  const used = await s.incr(`calls:${token}`, 1);
  if (used > t.cap) return fail(429, `This token has used all ${t.cap} demo calls.`);
  await assertBudget(env);

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, 'Request body must be JSON.');
  }
  if (!Array.isArray(payload.messages)) return fail(400, 'messages is required.');

  const allowed = allowedModels(env);
  const asked = String(payload.model || '');
  if(asked && !allowed.includes(asked))return fail(400,'That model is not available for text generation. Use /api/v1/systemone for decisions.');
  const model = asked || allowed[0];
  const stream = payload.stream === true;
  const maxTokens = Math.min(Number(payload.max_tokens ?? payload.max_completion_tokens ?? 1024) || 1024, MAX_OUT);

  const callStarted=Date.now();
  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
      'HTTP-Referer': 'https://tylerw.ai/demo',
      'X-Title': 'tylerw.ai demo (builder)',
    },
    body: JSON.stringify({
      ...payload,
      model,
      models: undefined,
      max_tokens: maxTokens,
      max_completion_tokens: undefined,
      reasoning: payload.reasoning ?? reasoningFor(model),
      provider: { sort: 'latency' },
      usage: { include: true },
    }),
  });


  if (!stream || !upstream.body) {
    const text = await upstream.text();
    try {
      await recordModelCall(env,'text',model,(JSON.parse(text) as { usage?: Usage }).usage,callStarted,upstream.ok?'ok':'failed');
    } catch {
      /* non-JSON error body */
    }
    return new Response(text, {
      status: upstream.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  // Stream straight through; watch the final chunk for usage/cost.
  const [client, watcher] = upstream.body.tee();
  ctx.waitUntil(
    (async () => {
      const reader = watcher.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      let usage: Usage | undefined;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:') || line.includes('[DONE]')) continue;
          try {
            const chunk = JSON.parse(line.slice(5)) as { usage?: Usage };
            if (chunk.usage) usage = chunk.usage;
          } catch {
            /* keep-alive comment */
          }
        }
      }
      await recordModelCall(env,'text',model,usage,callStarted,upstream.ok?'ok':'failed');
    })(),
  );
  return new Response(client, {
    status: upstream.status,
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
  });
});
