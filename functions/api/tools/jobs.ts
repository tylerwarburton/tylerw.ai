// POST /api/tools/jobs  { code }  ->  every O*NET task for the job sorted into
// Automate / Augment / Own, plus an exposure percentile against all jobs.
import {
  asset,
  assertBudget,
  body,
  deviceId,
  expected,
  handler,
  HttpError,
  json,
  judgeMany,
  pool,
  rateLimit,
  store,
  top,
  type Question,
} from '../_lib';

export const BUCKETS = ['Automate', 'Augment', 'Own'];

export const JOB_QUESTIONS: Record<string, Question> = {
  bucket: {
    type: 'choice',
    q: "Given today's AI tools, how will this task change?",
    options: [
      'Automate: AI can do it end to end with a check',
      'Augment: AI drafts, a person judges',
      'Own: needs human trust, accountability or presence',
    ],
  },
  exposure: {
    type: 'score',
    q: 'How much of this task could AI do today?',
    levels: ['almost none', 'a little', 'about half', 'most', 'almost all'],
  },
};

const BATCH = 14;

interface Job {
  code: string;
  title: string;
  tasks: { id: number; t: string; core: boolean }[];
}

export interface JobResult {
  code: string;
  title: string;
  tasks: { id: number; t: string; bucket: string; p: number; exposure: number; borderline: boolean }[];
  split: Record<string, number>;
  exposure: number;
  percentile: number | null;
  checks: number;
  ms: number;
}

export const onRequestPost = handler(async (ctx) => {
  const { env, request } = ctx;
  const device = deviceId(request);
  const { code } = await body<{ code?: string }>(request);
  if (!code || !/^\d{2}-\d{4}\.\d{2}$/.test(code)) throw new HttpError(400, 'Pick a job.');

  const job = await asset<Job>(ctx, `/demo-data/jobs/tasks/${code}.json`);
  if (!job?.tasks?.length) throw new HttpError(404, 'We do not have tasks for that job.');

  await rateLimit(env, device);
  const s = await store(env);
  const cacheKey = `jobs:${code}`;
  let result = JSON.parse((await s.get(cacheKey)) ?? 'null') as JobResult | null;
  const cached = !!result;

  if (!result) {
    await assertBudget(env);
    result = await sortJob(env, job);
    const baseline = await asset<number[]>(ctx, '/demo-data/jobs/baseline.json');
    result.percentile = baseline?.length ? percentileOf(baseline, result.exposure) : null;
    await s.set(cacheKey, JSON.stringify(result));
  }

  const borderline = result.tasks
    .filter((t) => t.borderline)
    .sort((a, b) => a.p - b.p)
    .slice(0, 3)
    .map((t) => t.t);
  ctx.waitUntil(
    Promise.all([
      s.addEvent(
        'jobs',
        device,
        { code, title: result.title, split: result.split, exposure: result.exposure, borderline },
        result.checks,
      ),
      s.incr('decisions', result.checks),
    ]),
  );
  return json({ ...result, cached });
});

export async function sortJob(env: Parameters<typeof judgeMany>[0], job: Job): Promise<JobResult> {
  const started = Date.now();
  const batches: Job['tasks'][] = [];
  for (let i = 0; i < job.tasks.length; i += BATCH) batches.push(job.tasks.slice(i, i + BATCH));

  const answers = (
    await pool(batches, 12, (tasks) =>
      judgeMany(
        env,
        tasks.map((t) => t.t),
        JOB_QUESTIONS,
        `These are tasks that a ${job.title} performs, from the U.S. Department of Labor O*NET database. Judge each task with today's widely available AI tools in mind.`,
      ).then((r) => r.answers),
    )
  ).flat();

  const tasks = job.tasks.map((t, i) => {
    const a = answers[i];
    const [label, p] = top(a.bucket);
    const bucket = label.split(':')[0];
    return { id: t.id, t: t.t, bucket, p, exposure: expected(a.exposure), borderline: p < 0.55 };
  });
  const split = Object.fromEntries(BUCKETS.map((b) => [b, tasks.filter((t) => t.bucket === b).length / tasks.length]));
  const exposure = tasks.reduce((a, t) => a + t.exposure, 0) / tasks.length;
  return {
    code: job.code,
    title: job.title,
    tasks,
    split,
    exposure,
    percentile: null,
    checks: tasks.length * Object.keys(JOB_QUESTIONS).length,
    ms: Date.now() - started,
  };
}

/** Share of jobs (0..1) whose mean exposure is below this one. `sorted` ascending. */
function percentileOf(sorted: number[], x: number) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo / sorted.length;
}
