// Pre-build demo caches before the event, straight against OpenRouter.
//   npx esbuild scripts/demo-warm.ts --bundle --platform=node --format=esm --outfile=/tmp/warm.mjs
//   OPENROUTER_API_KEY=... node /tmp/warm.mjs jobs|xray [ids...]
// jobs: scores every O*NET occupation -> public/demo-data/jobs/results/<code>.json
//       and the sorted exposure baseline -> public/demo-data/jobs/baseline.json
// xray: scores each app policy -> public/demo-data/xray/results/<id>.json
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { pool, type Env } from '../functions/api/_lib';
import { sortJob } from '../functions/api/tools/jobs';
import { score } from '../functions/api/tools/xray';

const env = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY } as Env;
// Run from the repo root.
const root = `${process.cwd()}/public/demo-data/`;
const [mode, ...only] = process.argv.slice(2);

async function jobs() {
  const out = `${root}jobs/results/`;
  mkdirSync(out, { recursive: true });
  const codes = only.length ? only : readdirSync(`${root}jobs/tasks`).map((f) => f.replace(/\.json$/, ''));
  let done = 0;
  await pool(codes, 16, async (code) => {
    const file = `${out}${code}.json`;
    if (!existsSync(file)) {
      const job = JSON.parse(readFileSync(`${root}jobs/tasks/${code}.json`, 'utf8'));
      try {
        const r = await sortJob(env, job);
        writeFileSync(file, JSON.stringify(r));
      } catch (e) {
        console.error(code, (e as Error).message);
      }
    }
    if (++done % 50 === 0) console.log(`${done}/${codes.length}`);
  });
  // Baseline + percentiles for every cached job.
  const all = readdirSync(out).map((f) => JSON.parse(readFileSync(`${out}${f}`, 'utf8')));
  const sorted = all.map((r) => r.exposure).sort((a: number, b: number) => a - b);
  writeFileSync(`${root}jobs/baseline.json`, JSON.stringify(sorted.map((x: number) => +x.toFixed(4))));
  for (const r of all) {
    let lo = 0;
    while (lo < sorted.length && sorted[lo] < r.exposure) lo++;
    r.percentile = lo / sorted.length;
    writeFileSync(`${out}${r.code}.json`, JSON.stringify(r));
  }
  console.log(`jobs: ${all.length} cached, baseline written`);
}

async function xray() {
  const out = `${root}xray/results/`;
  mkdirSync(out, { recursive: true });
  const apps = JSON.parse(readFileSync(`${root}xray/apps.json`, 'utf8')).filter((a: { clauses: number }) => a.clauses > 0);
  const ids = only.length ? only : apps.map((a: { id: string }) => a.id);
  for (const id of ids) {
    const policy = JSON.parse(readFileSync(`${root}xray/${id}.json`, 'utf8'));
    const t0 = Date.now();
    try {
      const card = await score(env, policy);
      writeFileSync(`${out}${id}.json`, JSON.stringify(card));
      console.log(id, `${card.clauses} clauses`, `${card.risks}/${card.riskTotal} risks`, `${Date.now() - t0} ms`);
    } catch (e) {
      console.error(id, (e as Error).message);
    }
  }
}

if (!env.OPENROUTER_API_KEY) throw new Error('Set OPENROUTER_API_KEY');
await (mode === 'xray' ? xray() : jobs());
