// LinkedIn pass-through. LinkedIn does not allow its profile pages to be
// embedded or scraped, but it lets you export your own data:
//   LinkedIn → Settings → Data privacy → Get a copy of your data → Positions
// Drop the resulting Positions.csv into src/data/linkedin/ and the site builds
// the full experience timeline from it on the next deploy.

export interface Position {
  company: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string; // '' = present
}

const files = import.meta.glob('./linkedin/*.csv', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

function load(): Position[] {
  const csv = Object.entries(files).find(([p]) => /positions\.csv$/i.test(p))?.[1];
  if (!csv) return [];
  const [head, ...rows] = parseCsv(csv);
  const col = (name: string) => head.findIndex((h) => h.trim().toLowerCase() === name);
  const idx = {
    company: col('company name'),
    title: col('title'),
    description: col('description'),
    location: col('location'),
    start: col('started on'),
    end: col('finished on'),
  };
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  return rows.map((r) => ({
    company: get(r, idx.company),
    title: get(r, idx.title),
    description: get(r, idx.description),
    location: get(r, idx.location),
    start: get(r, idx.start),
    end: get(r, idx.end),
  }));
}

export const positions = load();
