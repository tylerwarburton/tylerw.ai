// @ts-check
import { defineConfig } from 'astro/config';

// Static output for now — deploys to Cloudflare Pages with zero config.
// When dynamic features are wanted later (forms, SSR, Workers, KV), add
// the @astrojs/cloudflare adapter and switch `output` to 'server'/'hybrid'.
export default defineConfig({
  site: 'https://tylerw.ai',
  output: 'static',
  prefetch: true,
  // three.js (WebGPU build) is one lazy chunk loaded after first paint.
  vite: { build: { chunkSizeWarningLimit: 1000 } },
});
