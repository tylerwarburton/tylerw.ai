# /demo handoff: what's left before the talk

**Event:** ISACA Virginia Chapter CommunITy Day, **Saturday, October 3, 2026**. Tyler gives a live talk there.
**Pages:** `https://tylerw.ai/demo` for attendees' phones and `https://tylerw.ai/demo/wall` for the projector. Both are unlisted (noindex, no links to them).
**Branch:** `claude/upbeat-feynman-a9min0`. Open PRs against `main`; merging to main deploys through Cloudflare Workers Builds (the worker is `tylerw-ai`).
**Read first:** `docs/demo-setup.md` covers architecture, secrets, local dev, cache warming and endpoints.

## Hard rules

- **Never commit the OpenRouter key.** Locally it lives only in `.dev.vars`, which is gitignored. In production it is a Cloudflare secret.
- **Don't publish the raw OpenRouter key on the page or in code samples.** An earlier attempt was blocked. Attendees get per-device `tmx_` demo tokens from `POST /api/token`, which work against the passthrough `/api/v1/*`.
- **Don't put model identifiers in commits or PR text.**

## Current state (checked Oct 2)

| Area | State |
| --- | --- |
| Site and `/demo` pages | Live |
| Tools (Scam Check, X-ray, Job Radar, Make your own check) | Built. Live API returns `"The demo is not switched on yet"` because the secrets are not set |
| Pre-built caches | 923 jobs (`public/demo-data/jobs/results`) and 50 apps (`public/demo-data/xray/results`) |
| Any-app X-ray backend | Merged: `GET /api/apps/search?q=`, `POST /api/tools/xray {store: "<appId>"}` |
| Any-app X-ray UI | **Not built** |
| Build panel | Uses `tmx_` tokens with base URL `https://tylerw.ai/api/v1` |
| Spend on the key so far | About $1.34. Key limit is $50, expires 2026-10-07. `DEMO_SPEND_CAP` defaults to 45 |

## To do, in priority order

### 1. Set the Worker secrets (Tyler does this in the Cloudflare dashboard)

Go to **Workers & Pages → tylerw-ai → Settings → Variables and Secrets** and add these as type **Secret**:

- `OPENROUTER_API_KEY`
- `DEMO_ADMIN_KEY`: any long random string

Secrets apply without a redeploy. Until they are set, nothing below can be tested live.

**Verify:** a `POST /api/tools/scam` with `{"text":"Your USPS package is held. Pay $1.99 at usps-redelivery.top"}` should return a scorecard, not the "not switched on" error.

### 2. Fix the App Store search returning "busy" in production

`curl "https://tylerw.ai/api/apps/search?q=instagram"` currently returns `{"error":"App Store search is busy..."}`, which means the iTunes request failed with a non-200 response. This route doesn't depend on the secrets.

Suspects, in `functions/api/_policy.ts` `searchApps()`:
- The `cf: { cacheEverything }` fetch option.
- The Safari user-agent.
- iTunes rate-limiting or 403-ing Cloudflare egress.

How to proceed:
1. Log `res.status` and the response body to find the cause.
2. Try the request without `cf` and without the UA override.
3. If iTunes blocks Workers, fall back to `https://itunes.apple.com/search` through `r.jina.ai`, or to scraping `apps.apple.com/us/search?term=`.

Also check that `policyUrlFor()` can fetch `apps.apple.com/us/app/id<ID>` from the Worker. Locally, 19 of 20 random apps produced a readable policy; Nextdoor failed.

### 3. Build the any-app X-ray UI (`src/scripts/demo/app.ts`, about lines 341–400)

Today `renderPicker(q)` filters only the 50 apps in `/demo-data/xray/apps.json`. To add any-app search:

- **Search:** when the query is 2 or more characters, debounce for about 300 ms and call `GET /api/apps/search?q=`. It returns `{ apps: [{ id, name, seller, genre }] }`.
- **Results:** show the matches as an "App Store" row below the local matches. Prefer a local match when the names match exactly, because that result is pre-scored and instant.
- **Running a match:** clicking an App Store result should call `api('/api/tools/xray', { store: id })`. Add a `data-store` attribute next to the existing `data-app`.
- **Clause count:** it isn't known up front, so `ticker()` needs a total. Use about 120 clauses × 12 as an estimate, or an indeterminate progress state.
- **Timing:** a live run takes about 10–40 s, from policy fetch plus about 1,500 checks. Show "Reading the privacy policy…" before scoring starts.
- **Errors:**
  - 422 means the policy is unreadable.
  - 404 means the app has no policy link.
  - 429 means the live limit of 6 per minute per device was hit.
  - The handler's message is already human-readable; show it with `showError`.
- **Caching:** the response shape matches the `Card` the existing `renderXray` uses. Results cache server-side under `xray:as:<id>`, and a repeat run returns `cached: true`.
- **Copy:** update the empty-state text, which still says "No app by that name in tonight's list." to invite an App Store search.
- **Wall:** check that `/demo/wall` handles `app: "as-<id>"` events. The name is included in the event.

### 4. Optional: one-prompt Build panel

Tyler wanted a TypeSafe-style panel: one copyable prompt with the attendee's token already filled in, ending with "Type what you want this to do:", so attendees can paste it into Claude Code, ChatGPT or Cursor and get an MVP fast.

- **Where:** `src/pages/demo/index.astro` (Build section and the `code0`–`code2` frontmatter constants) and the token-filling logic in `app.ts` (`data-token-text`).
- **Token:** fill the prompt with the device's `tmx_` token, not the raw key.
- **Claude Code:** OpenRouter's Anthropic-compatible `/api/v1/messages` works, but the token-gated passthrough only implements `/api/v1/chat/completions` and `/api/v1/models`. Supporting Claude Code would need a `/api/v1/messages` passthrough added the same way.

### 5. Full live test once secrets are set (phone sized, about 390 px)

Test every tool:
- Scam Check
- X-ray on a cached app and on an App Store app
- Job Radar
- Make your own check
- Build: get a token, then run the curl sample against `/api/v1/chat/completions`

While testing, watch `/demo/wall` update. Note the latency; Mercury runs about 150 ms per Scam Check.

### 6. Morning of the talk (Tyler)

- Open `/demo/wall?key=<DEMO_ADMIN_KEY>` on the projector and press **R** to reset the test data. **F** freezes the wall.
- Confirm OpenRouter credit is above $40.

## Key files

- `functions/api/_lib.ts`: env, store, `completeJson`, `judgeMany`, budget and rate limits.
- `functions/api/tools/{scam,xray,jobs,custom}.ts`, `functions/api/_policy.ts`, `functions/api/apps/search.ts`, `functions/api/{token,wall}.ts`, `functions/api/v1/*`.
- `worker/index.ts`: router and the `RoomStore` Durable Object. New routes go in its route table.
- `src/pages/demo/{index,wall}.astro`, `src/scripts/demo/{app,wall}.ts`.
- `scripts/demo-warm.ts`: rebuilds the caches (see `docs/demo-setup.md`).

## Local dev

```bash
printf 'OPENROUTER_API_KEY=sk-or-...\nDEMO_ADMIN_KEY=localadmin\nDEMO_SPEND_CAP=9\n' > .dev.vars
npm run build && npx wrangler dev
```

Local latency is inflated by the sandbox proxy. Stop wrangler with `pkill -f "[w]rangler"`; the brackets stop the pattern from killing your own shell.
