// Commit history, resolved once at build time.
//
// With GITHUB_TOKEN set in the build environment (a fine-grained token that
// can read the orgs below), counts are refreshed live from the GitHub commit
// search API, including private repos. Without it, or if the API fails, the
// committed snapshot is used, so the build never breaks.
import snapshot from './github-snapshot.json';

export interface MonthCount {
  month: string; // YYYY-MM
  count: number;
}
export interface GithubStats {
  login: string;
  total: number;
  byOrg: Record<string, number>;
  months: MonthCount[];
  generatedAt: string;
  live: boolean;
}

const LOGIN = 'tylerwarburton';
const OWNERS = ['tylerwarburton', 'CipherPlayLabs', 'RandAOLabs', 'ArcAOGaming', 'InfrAOLabs', 'SatoshisPalace'];
const SCOPE = OWNERS.map((o) => `user:${o}`).join(' ');

async function count(token: string, q: string): Promise<number> {
  const res = await fetch(`https://api.github.com/search/commits?per_page=1&q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return ((await res.json()) as { total_count: number }).total_count;
}

function monthsSince(start: string, end: Date): string[] {
  const out: string[] = [];
  const d = new Date(`${start}-01T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

async function fetchLive(token: string): Promise<GithubStats> {
  const now = new Date();
  const months = monthsSince(snapshot.months[0].month, now);
  const monthCounts: MonthCount[] = [];
  // Search API allows 30 req/min; stay sequential.
  for (const m of months) {
    const [y, mo] = m.split('-').map(Number);
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    monthCounts.push({ month: m, count: await count(token, `author:${LOGIN} author-date:${m}-01..${m}-${last} ${SCOPE}`) });
  }
  const byOrg: Record<string, number> = {};
  for (const o of OWNERS) byOrg[o] = await count(token, `author:${LOGIN} user:${o}`);
  const total = Object.values(byOrg).reduce((a, b) => a + b, 0);
  return { login: LOGIN, total, byOrg, months: monthCounts, generatedAt: now.toISOString().slice(0, 10), live: true };
}

let cached: Promise<GithubStats> | undefined;

export function getGithubStats(): Promise<GithubStats> {
  cached ??= (async () => {
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      try {
        return await fetchLive(token);
      } catch (e) {
        console.warn(`[github] live fetch failed, using snapshot: ${(e as Error).message}`);
      }
    }
    return { ...snapshot, live: false };
  })();
  return cached;
}
