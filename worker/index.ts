// Cloudflare Worker entry for tylerw.ai (Workers Builds + static assets).
// /api/* goes to the demo handlers in functions/api (written in the Pages
// Functions style, so they also run under `wrangler pages dev`); everything
// else is the static Astro site in dist/.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../functions/api/_lib';
import * as scam from '../functions/api/tools/scam';
import * as xray from '../functions/api/tools/xray';
import * as jobs from '../functions/api/tools/jobs';
import * as custom from '../functions/api/tools/custom';
import * as token from '../functions/api/token';
import * as wall from '../functions/api/wall';
import * as chat from '../functions/api/v1/chat/completions';
import * as models from '../functions/api/v1/models';

type Handler = (ctx: never) => Promise<Response>;
const routes: Record<string, Handler | undefined> = {
  'POST /api/tools/scam': scam.onRequestPost,
  'POST /api/tools/xray': xray.onRequestPost,
  'POST /api/tools/jobs': jobs.onRequestPost,
  'POST /api/tools/custom': custom.onRequestPost,
  'POST /api/token': token.onRequestPost,
  'GET /api/wall': wall.onRequestGet,
  'POST /api/wall': wall.onRequestPost,
  'POST /api/v1/chat/completions': chat.onRequestPost,
  'GET /api/v1/models': models.onRequestGet,
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    const route = routes[`${request.method} ${url.pathname.replace(/\/$/, '')}`];
    if (!route) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    const res = await route({
      request,
      env,
      waitUntil: (p: Promise<unknown>) => ctx.waitUntil(p),
      passThroughOnException: () => ctx.passThroughOnException(),
      params: {},
      data: {},
      functionPath: url.pathname,
      next: () => env.ASSETS.fetch(request),
    } as never);
    // Builders call the passthrough from browsers and tools on other origins.
    if (url.pathname.startsWith('/api/v1/')) for (const [k, v] of Object.entries(cors())) res.headers.set(k, v);
    return res;
  },
} satisfies ExportedHandler<Env>;

function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, x-device-id',
  };
}

/**
 * All shared demo state (tokens, spend, rate limits, the room wall) lives in
 * one SQLite-backed Durable Object: strongly consistent, no database to create.
 */
export class RoomStore extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, tool TEXT NOT NULL, device TEXT NOT NULL, data TEXT NOT NULL, decisions INTEGER NOT NULL)',
    );
  }

  get(k: string): string | null {
    const rows = this.sql.exec<{ v: string }>('SELECT v FROM kv WHERE k = ?', k).toArray();
    return rows[0]?.v ?? null;
  }

  set(k: string, v: string) {
    this.sql.exec('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, v);
  }

  incr(k: string, by: number): number {
    const n = Number(this.get(k) ?? 0) + by;
    this.set(k, String(n));
    return n;
  }

  addEvent(tool: string, device: string, data: string, decisions: number) {
    this.sql.exec('INSERT INTO events (ts, tool, device, data, decisions) VALUES (?, ?, ?, ?, ?)', Date.now(), tool, device, data, decisions);
  }

  events() {
    return this.sql.exec('SELECT tool, device, data, decisions, ts FROM events ORDER BY id').toArray();
  }

  clearEvents() {
    this.sql.exec('DELETE FROM events');
    // Old per-minute rate-limit counters are not worth keeping either.
    this.sql.exec("DELETE FROM kv WHERE k LIKE 'rl:%'");
  }
}
