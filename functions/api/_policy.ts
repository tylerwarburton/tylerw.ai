// Any-app X-ray: find an app on the App Store, follow the developer's
// privacy-policy link from its App Store page, and split the policy into
// clauses. Runs inside the Worker; everything fetched is public.

import { HttpError } from './_lib';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const MAX_BYTES = 2_500_000;
const MAX_CLAUSES = 180;

export interface StoreApp {
  id: string;
  name: string;
  seller: string;
  genre: string;
}

/** App Store search (iTunes Search API): any app, no key needed. */
export async function searchApps(q: string): Promise<StoreApp[]> {
  const url = `https://itunes.apple.com/search?entity=software&country=us&limit=8&term=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'user-agent': UA }, cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit);
  if (!res.ok) throw new HttpError(503, 'App Store search is busy. Try again in a moment.');
  const d = (await res.json()) as {
    results?: { trackId: number; trackName: string; sellerName: string; primaryGenreName: string }[];
  };
  return (d.results ?? []).map((r) => ({
    id: String(r.trackId),
    name: r.trackName,
    seller: r.sellerName,
    genre: r.primaryGenreName,
  }));
}

/** App Store page -> the developer's privacy policy URL. */
export async function policyUrlFor(appId: string): Promise<{ url: string; name: string }> {
  const res = await fetch(`https://apps.apple.com/us/app/id${appId}`, {
    headers: { 'user-agent': UA, 'accept-language': 'en-US' },
    redirect: 'follow',
  });
  if (!res.ok) throw new HttpError(404, 'Could not open that app on the App Store.');
  const html = await res.text();
  const name = decode(html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? '')
    .replace(/\s*(-|on the)\s*App\s*Store$/i, '')
    .trim();
  const link =
    html.match(/aria-label="Developer[’']s Privacy Policy"[^>]*href="([^"]+)"/i)?.[1] ??
    html.match(/href="([^"]+)"[^>]*aria-label="Developer[’']s Privacy Policy"/i)?.[1] ??
    html.match(/"privacyPolicyUrl":"([^"]+)"/)?.[1]?.replace(/\\u002F/g, '/');
  if (!link) throw new HttpError(404, 'This app does not list a privacy policy on the App Store.');
  return { url: decode(link), name };
}

/**
 * Fetch a policy page and return its clauses. Tries the page directly; if it
 * blocks automated readers or renders its text with scripts, falls back to a
 * reader service that renders it in a real browser (r.jina.ai).
 */
export async function fetchPolicy(url: string, readerKey?: string): Promise<{ clauses: string[]; updated: string }> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new HttpError(422, 'That privacy policy link is not a valid web address.');
  }
  if (!/^https?:$/.test(u.protocol)) throw new HttpError(422, 'That privacy policy link is not a web page.');

  let text = '';
  const res = await fetch(u.toString(), {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US' },
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (res?.ok && (res.headers.get('content-type') || '').includes('html')) {
    text = htmlToText((await res.text()).slice(0, MAX_BYTES));
  }
  let clauses = splitClauses(text);

  if (clauses.length < 12) {
    const reader = await fetch(`https://r.jina.ai/${u.toString()}`, {
      headers: { accept: 'text/plain', ...(readerKey ? { authorization: `Bearer ${readerKey}` } : {}) },
      signal: AbortSignal.timeout(20000),
    }).catch(() => null);
    if (reader?.ok) {
      const md = (await reader.text()).slice(0, MAX_BYTES);
      if (!/returned error (4|5)\d\d/i.test(md.slice(0, 400))) {
        text = markdownToText(md);
        clauses = splitClauses(text);
      }
    }
  }
  if (clauses.length < 8) {
    throw new HttpError(422, "We couldn't read this app's privacy policy (the page blocks readers or no longer exists). Try another app.");
  }
  return { clauses: clauses.slice(0, MAX_CLAUSES), updated: findDate(text) };
}

/** Reader output (markdown) -> the same plain-text shape htmlToText produces. */
export function markdownToText(md: string) {
  const body = md.split(/\nMarkdown Content:\n/)[1] ?? md;
  return body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:\d+[.)]\s+)?#{1,6}\s*(.+?)\s*#*\s*$/gm, '\n\n§$1§\n')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+(?=§)/gm, '')
    .replace(/[*_`]{1,3}/g, '')
    .replace(/^\s*[-=|: ]{3,}\s*$/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// — Text extraction ——————————————————————————————————————————

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…' };

export function decode(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}

export function htmlToText(html: string) {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|button|select|iframe)\b[\s\S]*?<\/\1>/gi, ' ');
  const main = s.match(/<(main|article)\b[\s\S]*<\/\1>/i)?.[0];
  if (main && main.length > 3000) s = main;
  s = s
    .replace(/<(h[1-6])\b[^>]*>/gi, '\n\n§')
    .replace(/<\/(h[1-6])>/gi, '§\n')
    .replace(/<(br|\/p|\/li|\/div|\/tr|\/section|\/dd|\/dt|\/blockquote)\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ');
  return decode(s)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Paragraphs -> clauses of roughly 1-3 sentences (about 25-90 words), headings prefixed. */
export function splitClauses(text: string) {
  const out: string[] = [];
  let heading = '';
  let buf = '';
  const flush = () => {
    const t = buf.trim();
    if (t && words(t) >= 6) out.push(heading ? `${heading}: ${t}` : t);
    buf = '';
  };
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^§(.+)§$/);
    if (h || (words(line) <= 8 && !/[.!?:;]$/.test(line) && line.length < 80)) {
      flush();
      heading = (h ? h[1] : line).replace(/§/g, '').trim().slice(0, 80);
      continue;
    }
    const sentences = line.replace(/§/g, '').match(/[^.!?]+[.!?]+["”’)]*|[^.!?]+$/g) ?? [line];
    for (const sent of sentences) {
      const s = sent.trim();
      if (!s) continue;
      if (words(buf) + words(s) > 90 && words(buf) >= 25) flush();
      buf += (buf ? ' ' : '') + s;
      if (words(buf) >= 60) flush();
    }
    if (words(buf) >= 25) flush();
  }
  flush();
  // Drop near-duplicates (repeated banners, cookie notices).
  const seen = new Set<string>();
  return out.filter((c) => {
    const k = c.toLowerCase().replace(/[^a-z]/g, '').slice(0, 120);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function findDate(text: string) {
  const m = text.match(
    /(?:last\s+(?:updated|modified|revised)|effective(?:\s+date)?|updated)[:\s]*(?:on\s+)?((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})/i,
  );
  return m?.[1] ?? '';
}
