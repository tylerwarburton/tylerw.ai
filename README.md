# tylerw.ai

Personal site — the **Signal** look: dark operator-console aesthetic, one blue accent, system fonts, hairline borders. Built with [Astro](https://astro.build), deployed to Cloudflare Pages.

## Edit the content

- **`src/data/site.ts`**: identity, token usage numbers, companies, talks,
  Token Maxers, calendar link, socials. `// TODO` marks values to confirm.
- **`src/data/projects.ts`**: every project. Each entry becomes a card on
  `/projects` and its own page at `/projects/<slug>`.
- **`src/data/github-snapshot.json`**: monthly commit counts. Set a
  `GITHUB_TOKEN` env var in Cloudflare Pages (fine-grained, read access to the
  orgs) and the build refreshes these live, private repos included; without it
  the snapshot is used.

## The hero field

`src/scripts/field.ts` renders the particle field with three.js
`WebGPURenderer`: WebGPU where the browser supports it, WebGL2 otherwise
(including browsers whose WebGPU fails the first frame). It lazy-loads after
first paint, pauses off screen, and renders a still frame for reduced motion.

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # output to dist/
npm run preview  # preview the production build
```

Requires Node 22 (see `.nvmrc`).

## Design system

Tokens are ported verbatim into `src/styles/tokens.css` (colors, type, radii,
spacing, motion). `src/styles/global.css` layers the brand primitives on top.
Rules: one accent (blue `#5b8def`), system fonts only, weight ≤ 600, depth via
surface steps not shadow. Gradients and glow are reserved for the hero, data
viz, and hover states.

## Deploy

Pushes to `main` deploy automatically via Cloudflare Pages.

- Build command: `npm run build`
- Output directory: `dist`
- Node version: `22`

## Structure

```
src/
  data/site.ts        ← all editable content
  styles/             ← tokens + global base
  scripts/field.ts    ← WebGPU/WebGL hero scene
  components/         ← Hero, Numbers, Work, Companies, Activity, Speaking, Book, …
  layouts/Base.astro  ← <head>, meta, scroll reveal + spotlight
  pages/index.astro   ← home
  pages/projects/     ← index + one page per project
public/               ← favicon, static assets
```
