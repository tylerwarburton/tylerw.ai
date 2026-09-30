# /demo setup (System 1, live)

Unlisted pages: `/demo` (phones) and `/demo/wall` (projector). The site deploys
as the **tylerw-ai Worker** (Cloudflare Workers Builds): `wrangler.jsonc` serves
the static Astro build from `dist/` and routes `/api/*` to `worker/index.ts`,
which runs the handlers in `functions/api/`. Shared state (tokens, spend, rate
limits, the room wall) lives in one Durable Object, created automatically on
deploy. There is no database to set up.

## One-time setup

Cloudflare dashboard → **Workers & Pages → tylerw-ai → Settings → Variables and
Secrets**, add (type **Secret**):

- `OPENROUTER_API_KEY`: the OpenRouter key. Put a credit limit on the key in
  OpenRouter; that is the hard cap.
- `DEMO_ADMIN_KEY`: any long random string. Open the wall as
  `/demo/wall?key=<this>` to enable **F** (freeze) and **R** (reset).

Optional (type **Text**): `DEMO_SPEND_CAP` (USD, default 45; the page shows
"budget reached" there), `DEMO_MODEL` (default `inception/mercury-2.5`),
`DEMO_FALLBACK_MODELS`, `DEMO_XRAY_MODEL` (default `openai/gpt-oss-120b`).

Secrets take effect immediately; no redeploy needed. `keep_vars` in
`wrangler.jsonc` keeps dashboard variables across deploys.

## Before the talk

- Open `/demo/wall?key=…` on the projector and press **R** to clear test data.
- Caches are pre-built: every Job Radar occupation (`public/demo-data/jobs/results`)
  and every X-ray app (`public/demo-data/xray/results`). Rebuild with
  `scripts/demo-warm.ts` if questions change.

## Local development

```bash
printf 'OPENROUTER_API_KEY=sk-or-...\nDEMO_ADMIN_KEY=localadmin\nDEMO_SPEND_CAP=9\n' > .dev.vars
npm run build
npx wrangler dev
```

Rebuild the caches (from the repo root):

```bash
npx esbuild scripts/demo-warm.ts --bundle --platform=node --format=esm --outfile=/tmp/warm.mjs
OPENROUTER_API_KEY=sk-or-... node /tmp/warm.mjs jobs      # all occupations + percentile baseline
OPENROUTER_API_KEY=sk-or-... node /tmp/warm.mjs xray      # every app policy
```

## Endpoints

| Endpoint | Does |
| --- | --- |
| `POST /api/tools/scam` | 12 questions about one message, one call |
| `POST /api/tools/xray` | every policy clause × 12 questions, batched and cached |
| `POST /api/tools/jobs` | every O\*NET task for a job → Automate / Augment / Own |
| `POST /api/tools/custom` | up to 4 attendee-written questions about short text |
| `POST /api/token` | demo token: one per device, until midnight ET, 2,000 calls |
| `POST /api/v1/chat/completions` | OpenAI-compatible passthrough, token-gated |
| `GET /api/v1/models` | allowed models |
| `GET/POST /api/wall` | room totals; presenter freeze/reset |

Privacy: message text is never stored or logged. The wall only sees types,
verdict bands, flags, app names and job titles.
