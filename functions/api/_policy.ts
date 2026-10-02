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
  icon?: string;
}

/** App Store search (iTunes Search API): any app, no key needed. */
export async function searchApps(q: string, readerKey?: string): Promise<StoreApp[]> {
  const url = `https://itunes.apple.com/search?entity=software&country=us&limit=24&term=${encodeURIComponent(q)}`;
  // Apple can reject datacenter egress. Keep the direct request plain, then
  // use the public reader as a separate egress path. Never forward demo keys.
  for (const reader of [false, true]) {
    try {
      const res = await fetch(reader ? `https://r.jina.ai/${url}` : url, {
        headers: reader
          ? { accept: 'text/plain', ...(readerKey ? { authorization: `Bearer ${readerKey}` } : {}) }
          : { accept: 'application/json' },
        signal: AbortSignal.timeout(reader ? 12000 : 5000),
      });
      if (!res.ok) {
        console.warn('App search upstream failed', reader ? 'reader' : 'apple', res.status);
        continue;
      }
      const raw = (await res.text()).slice(0, MAX_BYTES);
      const content = reader ? raw.split(/\nMarkdown Content:\s*\n/).pop()! : raw;
      const d = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)) as { results?: { trackId: number; trackName: string; sellerName?: string; primaryGenreName?: string; artworkUrl100?: string; artworkUrl512?: string }[] };
      if (!Array.isArray(d.results)) throw new Error('Invalid search response');
      return d.results.filter((r) => /^\d{5,12}$/.test(String(r.trackId)) && typeof r.trackName === 'string')
        .slice(0, 24).map((r) => ({
          id: String(r.trackId), name: r.trackName,
          seller: String(r.sellerName ?? ''), genre: String(r.primaryGenreName ?? ''),
          ...(appleIcon(r.artworkUrl512 || r.artworkUrl100) ? { icon: appleIcon(r.artworkUrl512 || r.artworkUrl100) } : {}),
        }));
    } catch {
      console.warn('App search upstream unavailable', reader ? 'reader' : 'apple');
    }
  }
  // The store's rendered search page remains usable when the legacy search
  // API or reader is unavailable. Extract only first-party app result links.
  try {
    const res = await fetch(`https://apps.apple.com/us/iphone/search?term=${encodeURIComponent(q)}`, {
      headers: { accept: 'text/html', 'accept-language': 'en-US' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const apps = parseStoreSearch((await res.text()).slice(0, MAX_BYTES));
      if (apps.length) return apps;
    }
  } catch {
    console.warn('App search page unavailable');
  }
  throw new HttpError(503, 'App Store search is temporarily unavailable. Please try your search again.');
}

export function parseStoreSearch(html: string): StoreApp[] {
  const apps = new Map<string, StoreApp>();
  const visit = (value: unknown, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 35 || apps.size >= 24) return;
    const item = value as Record<string, any>;
    if (item.$kind === 'MixedMediaLockup' && /^\d{5,12}$/.test(String(item.adamId)) && typeof item.title === 'string') {
      const icon = appleIcon(item.icon?.template?.replace('{w}', '128').replace('{h}', '128').replace('{c}', 'bb').replace('{f}', 'webp'));
      apps.set(String(item.adamId), { id: String(item.adamId), name: item.title, seller: String(item.developerName ?? ''), genre: '', ...(icon ? { icon } : {}) });
      return;
    }
    for (const child of Object.values(value)) visit(child, depth + 1);
  };
  for (const [, content] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(content)); } catch { /* scripts that are not data */ }
  }
  for (const [tag] of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = tag.match(/\bhref="([^"]+)"/i)?.[1] ?? '';
    const id = href.match(/^https:\/\/apps\.apple\.com\/us\/app\/[^"?#]*?\bid(\d{5,12})(?:[?#]|$)/)?.[1];
    const name = decode(tag.match(/\baria-label="([^"]+)"/i)?.[1] ?? '').trim();
    if (id && name && !apps.has(id)) apps.set(id, { id, name, seller: '', genre: '' });
    if (apps.size >= 24) break;
  }
  return [...apps.values()];
}

function appleIcon(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname.endsWith('.mzstatic.com')) return url.toString();
  } catch { /* missing artwork */ }
}

/** App Store page -> the developer's privacy policy URL. */
export function parsePolicyLink(raw: string): {url:string;name:string} | null {
  const name = decode(raw.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1] ?? raw.match(/^Title:\s*(.+)$/m)?.[1] ?? '')
    .replace(/\s*[-–—]\s*App\s*(?:Store|ストア).*$/i,'').replace(/\s+on the App Store$/i,'').trim();
  const link =
    raw.match(/aria-label="Developer[’']s Privacy Policy"[^>]*href="([^"]+)"/i)?.[1] ??
    raw.match(/href="([^"]+)"[^>]*aria-label="Developer[’']s Privacy Policy"/i)?.[1] ??
    raw.match(/"privacyPolicyUrl"\s*:\s*"([^"]+)"/)?.[1]?.replace(/\\u002F/g,'/').replace(/\\\//g,'/') ??
    raw.match(/\[Developer[’']s\s+Privacy Policy[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+[^)]*)?\)/i)?.[1] ??
    raw.match(/\[Privacy Policy[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+[^)]*)?\)/i)?.[1];
  if (!link) return null;
  try {
    const url = new URL(decode(link));
    // Apple footer links are not the app developer's policy.
    const explicitDeveloper = /aria-label="Developer[’']s Privacy Policy"|"privacyPolicyUrl"|\[Developer[’']s\s+Privacy Policy/i.test(raw);
    if (!/^https?:$/.test(url.protocol) || (!explicitDeveloper && /^(?:www\.)?apple\.com$/.test(url.hostname))) return null;
    return {url:url.toString(),name};
  } catch {return null;}
}

export async function policyUrlFor(appId: string, readerKey?:string): Promise<{ url: string; name: string }> {
  const url=`https://apps.apple.com/us/app/id${appId}`;
  let readable=false;
  for (const reader of [false,true]) {
    try {
      const res=await fetch(reader ? `https://r.jina.ai/${url}` : url, {
        headers:reader ? {accept:'text/plain',...(readerKey ? {authorization:`Bearer ${readerKey}`} : {})} : {accept:'text/html','accept-language':'en-US'},
        redirect:'follow',signal:AbortSignal.timeout(reader ? 15000 : 8000),
      });
      if (!res.ok) continue;
      const raw=(await res.text()).slice(0,MAX_BYTES);
      if (/returned error (4|5)\d\d/i.test(raw.slice(0,500))) continue;
      const parsed=parsePolicyLink(raw);
      if (parsed) return parsed;
      if (/app privacy|developer.{0,15}privacy|privacyPolicyUrl/i.test(raw)) readable=true;
    } catch { /* Try the independent public reader if Apple is unavailable. */ }
  }
  if (readable) throw new HttpError(422,'The App Store page did not expose a readable developer privacy-policy link. Try another app.');
  throw new HttpError(503,'The App Store could not load this app right now. Please retry this app.');
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
