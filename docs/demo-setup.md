# Live attendee tools

Updated October 2, 2026: attendee analyses run live on every request. Precomputed job/app scorecards are no longer used by the tools. Do not restore cached answers or animated check counts.

## Pages

- `/demo/`: tool selection and Build prompt
- `/demo/scam/`: paste an email or message
- `/demo/xray/`: search the App Store with official artwork, select an app, fetch its policy and analyze it live
- `/demo/jobs/`: enter a title and actual responsibilities, one per line; each task is classified live
- `/demo/custom/`: enter text and questions
- `/demo/wall/`: aggregate activity

App catalog metadata and verified app-to-policy URLs may be cached to reduce upstream failures. Policy links are reused for up to seven days, with background refresh after one day; a first-time lookup has one bounded recovery attempt. Policy text and decisions are fetched/generated fresh on every scan. Analysis results are never reused. Policies that block reading return an error rather than a canned result.

## Deployment and secrets

Merging to main deploys the `tylerw-ai` Worker through Cloudflare Workers Builds. `wrangler.jsonc` binds the existing account Secrets Store entries `OPENROUTER_API_KEY` and `DEMO_ADMIN_KEY`. `worker/secrets.ts` reads bindings asynchronously, without exposing values. Direct Worker secrets of the same names also work, including local `.dev.vars`.

Never commit or publish real keys. Attendees use short-lived `tmx_` tokens through `/api/v1/chat/completions`. The Build prompt fills in their token. Model identifiers must not appear in commit messages or PR prose.

## Implementation

The decision backend now calls OpenRouter's native Decisions API at `/api/alpha/decisions`, pinned to `typesafe/jev-1.13`. It uses the existing server-side OpenRouter secret. No classification may fall back to a text-generating model.

- Email: Jev answers Noul/Choice/Score questions; server-side gates enforce scam → spam → priority, stopping on uncertain or flagged results.
- Job Radar: a separately metered text model extracts editable responsibilities. After user review, Jev classifies each responsibility and scores exposure. Manual input skips text generation.
- App scan: fetch the live policy; Jev classifies each of 12 topics and selects an actual source passage. A second Jev call verifies supported findings against the whole fetched policy. Low-probability or unsupported findings remain unclear. Fixed labels and original source text provide the display; there is no generated explanation pretending to be Jev output.
- Custom checks: direct native Noul/Choice/Score decisions. Native probabilities are preserved; score index 0 maps to UI level 1.
- Build: attendee tokens call `POST /api/v1/systemone` with `state`, `questions`, and the decision model. Optional text generation remains a separate `/api/v1/chat/completions` endpoint. `/api/v1/models` explicitly identifies each model's purpose and endpoint. Both endpoints share token expiry, call caps, and the global budget.

Usage receipts report total workflow time and actual provider cost, plus separate decision/text API durations and costs. API durations are summed across calls (including retries), not a claim about pure inference or a benchmark. Missing cost is marked incomplete. Each stage reports the actual serving model. Legacy total decisions/spend remain visible, while Jev counters start with this architecture update; do not relabel earlier LLM activity as Jev.

The app's red/yellow/green columns describe the policy text, not observed app behavior or guarantees of safety. Jev choice probability is not probability of harm. The thresholds are demo rules, not empirically calibrated risk thresholds.

References: https://openrouter.ai/docs/guides/community/jev and https://openrouter.ai/docs/guides/community/jev-tutorial .

- `src/components/DemoExperience.astro`: shared layout and tool forms
- `src/pages/demo/[tool].astro`: dedicated tool routes
- `src/scripts/demo/app.ts`: input, search and live result rendering
- `functions/api/tools/`: fresh analysis handlers
- `functions/api/_policy.ts`: Apple search, official artwork and privacy policy reading
- `worker/index.ts`: router and shared room store

## Test

Run `npm ci`, `npm run build`, and `node tests/demo-search.test.mjs`. For local use, set secrets in gitignored `.dev.vars`, then run `npx wrangler dev`. Production Secrets Store values are not available locally.

Before the talk, verify each tool with attendee-provided input, check App Store search and icons, use a Build token for a completion, and watch the wall. Open the presenter wall with `?key=<DEMO_ADMIN_KEY>`; R clears test events and F freezes the display. Confirm the provider key has sufficient remaining credit.
