// One experience list for the site: LinkedIn export when present, the
// hand-written fallback in site.ts otherwise. Shaped like LinkedIn's own
// Experience section: roles grouped by company, newest first.
import { positions } from './linkedin';
import { site } from './site';

export interface Role {
  title: string;
  start: string;
  end: string; // '' = present
  location: string;
  description: string;
}
export interface CompanyGroup {
  company: string;
  href?: string;
  roles: Role[];
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Aug 2026" | "2024" | "" -> months since year 0, or null. */
function toMonths(s: string, fallbackMonth: number): number | null {
  const m = s.trim().match(/^(?:([A-Za-z]{3})[a-z]*\s+)?(\d{4})$/);
  if (!m) return null;
  const mo = m[1] ? MONTHS.indexOf(m[1].toLowerCase()) : fallbackMonth;
  return +m[2] * 12 + (mo < 0 ? fallbackMonth : mo);
}
const now = () => {
  const d = new Date();
  return d.getFullYear() * 12 + d.getMonth();
};

/** LinkedIn-style "2 yrs 3 mos" (inclusive of the start month). */
export function duration(start: string, end: string): string {
  const a = toMonths(start, 0);
  const b = end ? toMonths(end, 11) : now();
  if (a == null || b == null || b < a) return '';
  const total = b - a + 1;
  const y = Math.floor(total / 12);
  const mo = total % 12;
  return [y && `${y} yr${y > 1 ? 's' : ''}`, mo && `${mo} mo${mo > 1 ? 's' : ''}`].filter(Boolean).join(' ');
}

export function span(role: Pick<Role, 'start' | 'end'>): string {
  if (!role.start) return '';
  return `${role.start} – ${role.end || 'Present'}`;
}

const extras = new Map(site.companies.map((c) => [c.name.toLowerCase(), c]));

const rows: (Role & { company: string })[] = positions.length
  ? positions.map((p) => ({
      company: p.company,
      title: p.title,
      start: p.start,
      end: p.end,
      location: p.location,
      description: p.description || extras.get(p.company.toLowerCase())?.note || '',
    }))
  : site.companies.map((c) => ({
      company: c.name,
      title: c.role,
      start: c.start,
      end: c.end,
      location: '',
      description: c.note,
    }));

const groups: CompanyGroup[] = [];
for (const r of rows) {
  let g = groups.find((x) => x.company.toLowerCase() === r.company.toLowerCase());
  if (!g) {
    const extra = extras.get(r.company.toLowerCase());
    g = { company: r.company, href: extra && 'href' in extra ? extra.href : undefined, roles: [] };
    groups.push(g);
  }
  const { company: _c, ...role } = r;
  g.roles.push(role);
}

/** Company tenure: earliest start to latest end across its roles. */
export function tenure(g: CompanyGroup): string {
  const starts = g.roles.map((r) => r.start).filter((s) => toMonths(s, 0) != null);
  if (!starts.length) return '';
  const first = starts.reduce((a, b) => ((toMonths(a, 0) ?? 0) <= (toMonths(b, 0) ?? 0) ? a : b));
  const open = g.roles.some((r) => !r.end);
  const last = open ? '' : g.roles.map((r) => r.end).reduce((a, b) => ((toMonths(a, 11) ?? 0) >= (toMonths(b, 11) ?? 0) ? a : b));
  return duration(first, last);
}

// A fallback note fills a gap, so show it once per company, not per role.
for (const g of groups) {
  const seen = new Set<string>();
  for (const r of g.roles) {
    if (seen.has(r.description)) r.description = '';
    else if (r.description) seen.add(r.description);
  }
}

export const experience = groups;
export const fromLinkedIn = positions.length > 0;
