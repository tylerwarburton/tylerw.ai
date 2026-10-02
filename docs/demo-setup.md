# Live attendee tools

Updated October 2, 2026: attendee analyses run live on every request. Precomputed job/app scorecards are no longer used by the tools. Do not restore cached answers or animated check counts.

## Pages

- `/demo/`: tool selection and Build prompt
- `/demo/scam/`: paste an email or message
- `/demo/xray/`: search the App Store with official artwork, select an app, fetch its policy and analyze it live
- `/demo/jobs/`: enter a title and actual responsibilities, one per line; each task is classified live
- `/demo/custom/`: enter text and questions
- `/demo/wall/`: aggregate activity

App catalog metadata may be cached to reduce upstream search failures. Analysis results are never reused. Policies that block reading return an error rather than a canned result.

## Deployment and secrets

Merging to main deploys the `tylerw-ai` Worker through Cloudflare Workers Builds. `wrangler.jsonc` binds the existing account Secrets Store entries `OPENROUTER_API_KEY` and `DEMO_ADMIN_KEY`. `worker/secrets.ts` reads bindings asynchronously, without exposing values. Direct Worker secrets of the same names also work, including local `.dev.vars`.

Never commit or publish real keys. Attendees use short-lived `tmx_` tokens through `/api/v1/chat/completions`. The Build prompt fills in their token. Model identifiers must not appear in commit messages or PR prose.

## Implementation

The current implementation calls OpenRouter directly. It does not use a JEV SDK or JEV endpoint.

- `src/components/DemoExperience.astro`: shared layout and tool forms
- `src/pages/demo/[tool].astro`: dedicated tool routes
- `src/scripts/demo/app.ts`: input, search and live result rendering
- `functions/api/tools/`: fresh analysis handlers
- `functions/api/_policy.ts`: Apple search, official artwork and privacy policy reading
- `worker/index.ts`: router and shared room store

## Test

Run `npm ci`, `npm run build`, and `node tests/demo-search.test.mjs`. For local use, set secrets in gitignored `.dev.vars`, then run `npx wrangler dev`. Production Secrets Store values are not available locally.

Before the talk, verify each tool with attendee-provided input, check App Store search and icons, use a Build token for a completion, and watch the wall. Open the presenter wall with `?key=<DEMO_ADMIN_KEY>`; R clears test events and F freezes the display. Confirm the provider key has sufficient remaining credit.
