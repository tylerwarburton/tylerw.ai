# /demo setup (System 1, live)

Unlisted pages: `/demo` (phones) and `/demo/wall` (projector). The API is
Cloudflare Pages Functions in `functions/api/`, deployed with the site.

## One-time Cloudflare setup (Pages project → Settings)

1. **Variables and Secrets** (Production):
   - `OPENROUTER_API_KEY`: secret. Set a credit limit on the key itself in
     OpenRouter ($10 for testing, $50 for the event); that is the hard cap.
   - `DEMO_SPEND_CAP`: soft cap in USD, e.g. `9` for the test key, `45` for the
     event key. The demo shows "budget reached" at this number.
   - `DEMO_ADMIN_KEY`: any long random string. Open the wall as
     `/demo/wall?key=<this>` to enable F (freeze) and R (reset).
   - `DEMO_MODEL` (optional): the fast model; defaults to `openai/gpt-oss-120b`.
   - `DEMO_FALLBACK_MODELS` (optional): comma-separated backups.
2. **Bindings → D1 database**: create a D1 database (e.g. `tylerw-demo`) and
   bind it as `DEMO_DB`. Tables are created automatically on first request.
   Without it, each Cloudflare isolate keeps its own memory and the wall,
   tokens and spend tracking are not shared.
3. Redeploy (push to `main`, or "Retry deployment").

## Before the talk

- Open `/demo/wall?key=…` on the projector and press **R** to clear test data.
- Warm caches: run every X-ray app and the six Job Radar chips once.

## Local development

```bash
printf 'OPENROUTER_API_KEY=sk-or-...\nDEMO_ADMIN_KEY=localadmin\nDEMO_SPEND_CAP=9\n' > .dev.vars
npm run build
npx wrangler pages dev dist --d1 DEMO_DB=demo-local
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
