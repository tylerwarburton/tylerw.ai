// tylerw.ai/demo: client for the four tools, the Build panel and the sheet.
// No login: a random device id in sessionStorage ties this phone's runs to
// the room wall without identifying anyone.

type Dist = Record<string, number>;

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel));

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const pct = (p: number) => `${Math.round(p * 100)}%`;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s`;

// — Device id ——————————————————————————————————————————————
function deviceId() {
  try {
    let id = sessionStorage.getItem('demo-device');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('demo-device', id);
    }
    return id;
  } catch {
    return (window as unknown as { __dev?: string }).__dev ??= crypto.randomUUID();
  }
}

// — API with friendly retries ——————————————————————————————————
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(path: string, payload: unknown, onRetry?: (msg: string) => void): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': deviceId() },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (res?.ok) return (await res.json()) as T;
    const data = res ? await res.json().catch(() => ({})) : {};
    const status = res?.status ?? 0;
    const retryable = status === 0 || status === 429 || status === 503;
    if (retryable && attempt < 3) {
      const wait = 2 + attempt;
      onRetry?.(`The room is busy, trying again in ${wait} s…`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    throw new ApiError(status, (data as { error?: string }).error || 'Something went wrong. Try again.');
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

// — Toast, copy ——————————————————————————————————————————————
let toastTimer = 0;
function toast(msg: string) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 2200);
}

async function copy(text: string, what = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(what);
}

// — Sheet ————————————————————————————————————————————————————
const TITLES: Record<string, string> = {
  scam: 'Scam Check',
  xray: 'App Privacy X-ray',
  jobs: 'Job Radar',
  custom: 'Make your own check',
};
const openers: Record<string, () => void> = {};

function openSheet(tool: string, push = true) {
  const sheet = $('#sheet');
  $$('.tool', sheet).forEach((t) => (t.hidden = t.dataset.tool !== tool));
  $('#sheetTitle').textContent = TITLES[tool];
  $('#scrim').hidden = false;
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add('open'));
  document.body.style.overflow = 'hidden';
  if (push) history.pushState({ tool }, '', `#${tool}`);
  openers[tool]?.();
  setTimeout(() => $<HTMLElement>('textarea, input', $(`.tool[data-tool="${tool}"]`))?.focus({ preventScroll: true }), 300);
}

function closeSheet(pop = true) {
  const sheet = $('#sheet');
  sheet.classList.remove('open');
  $('#scrim').hidden = true;
  document.body.style.overflow = '';
  setTimeout(() => (sheet.hidden = true), 280);
  if (pop && location.hash) history.back();
}

$$('[data-open]').forEach((b) => b.addEventListener('click', () => openSheet(b.dataset.open!)));
$('#sheetBack').addEventListener('click', () => closeSheet());
$('#scrim').addEventListener('click', () => closeSheet());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
});
window.addEventListener('popstate', () => {
  const tool = location.hash.slice(1);
  if (TITLES[tool]) openSheet(tool, false);
  else if (!$('#sheet').hidden) closeSheet(false);
});


// — Shared result pieces ——————————————————————————————————————
function ticker(el: HTMLElement, total: number, label: string, expectMs: number) {
  const start = performance.now();
  let raf = 0;
  const frame = () => {
    const t = Math.min((performance.now() - start) / expectMs, 0.97);
    el.innerHTML = `<div class="ticker">checks: ${fmt(total * (1 - Math.pow(1 - t, 2)))}…<small>${esc(label)}</small></div>`;
    raf = requestAnimationFrame(frame);
  };
  frame();
  return {
    retry(msg: string) {
      cancelAnimationFrame(raf);
      el.innerHTML = `<div class="err">${esc(msg)}</div>`;
    },
    stop: () => cancelAnimationFrame(raf),
  };
}

/** Plays a counter up to the real total (used for cached runs too). */
function countUp(el: HTMLElement, total: number, ms = 900) {
  return new Promise<void>((done) => {
    const start = performance.now();
    const frame = () => {
      const t = Math.min((performance.now() - start) / ms, 1);
      el.innerHTML = `<div class="ticker">checks: ${fmt(total * (1 - Math.pow(1 - t, 3)))}</div>`;
      if (t < 1) requestAnimationFrame(frame);
      else done();
    };
    frame();
  });
}

function pbar(label: string, p: number, color = 'var(--d-accent)') {
  return `<div class="pbar" style="--c:${color}"><span class="l" title="${esc(label)}">${esc(label)}</span><span class="b"><i style="width:${(p * 100).toFixed(1)}%"></i></span><span class="v">${pct(p)}</span></div>`;
}

function deeper(prompt: string) {
  const q = encodeURIComponent(prompt);
  return `<div class="panel-d"><h4>Go deeper in your own AI</h4><div class="deeper">
    <a class="btn-d" href="https://claude.ai/new?q=${q}" target="_blank" rel="noopener" data-copy-text="${esc(prompt)}">Ask Claude</a>
    <a class="btn-d" href="https://chatgpt.com/?q=${q}" target="_blank" rel="noopener" data-copy-text="${esc(prompt)}">Ask ChatGPT</a>
    <button class="btn-d" data-copy-text="${esc(prompt)}">Copy prompt</button></div></div>`;
}

document.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-copy-text]');
  if (!el) return;
  void copy(el.dataset.copyText!, el.tagName === 'A' ? 'Prompt copied too, in case it does not pre-fill' : 'Prompt copied');
});

/** Bring a fresh result into view inside the sheet (results land below the fold on phones). */
function reveal(el: HTMLElement) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(() => el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }));
}

function showError(el: HTMLElement, err: unknown) {
  el.innerHTML = `<div class="err">${esc(err instanceof Error ? err.message : 'Something went wrong.')}</div>`;
}

const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const initials = (name: string) =>
  name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || name.slice(0, 2);

// — Scam Check ——————————————————————————————————————————————
const EXAMPLES: Record<string, string> = {
  toll: 'FINAL NOTICE: Your E-ZPass account has an unpaid toll balance of $4.35. Pay by today to avoid a $50 late fee and suspension: https://ezpass-va.info/pay',
  package:
    'USPS: Your package is on hold due to an incomplete address. Update your details within 24 hours or it will be returned: https://usps-redelivery.co/track',
  wrong: "Hi Jenny, it's Mike from the conference last week. Are we still on for coffee Thursday? Sorry if wrong number!",
  legit: 'Your Chase card ending in 4412 was used for $62.18 at Kroger. If this wasn\'t you, call the number on the back of your card.',
};

interface ScamResult {
  band: 'scam' | 'legit' | 'unsure';
  likelihood: number;
  kind: { top: string; p: number; dist: Dist };
  wants: string;
  pressure: Dist;
  flags: { key: string; label: string; p: number }[];
  checks: number;
  ms: number;
}

$$('[data-example]').forEach((b) =>
  b.addEventListener('click', () => {
    $<HTMLTextAreaElement>('#scamText').value = EXAMPLES[b.dataset.example!];
  }),
);
$('#scamText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    void runScam();
  }
});
$('#scamGo').addEventListener('click', () => void runScam());

async function runScam() {
  const text = $<HTMLTextAreaElement>('#scamText').value.trim();
  const out = $('#scamOut');
  if (text.length < 8) return toast('Paste a message first');
  const btn = $<HTMLButtonElement>('#scamGo');
  btn.disabled = true;
  const t = ticker(out, 12, '12 questions, one call', 700);
  const started = performance.now();
  try {
    const r = await api<ScamResult>('/api/tools/scam', { text }, t.retry);
    t.stop();
    renderScam(out, r, performance.now() - started, text);
    reveal(out);
  } catch (e) {
    t.stop();
    showError(out, e);
  } finally {
    btn.disabled = false;
  }
}

function renderScam(out: HTMLElement, r: ScamResult, roundTrip: number, text: string) {
  const v =
    r.band === 'scam'
      ? { word: 'Likely scam', c: 'var(--d-bad)' }
      : r.band === 'legit'
        ? { word: 'Looks legitimate', c: 'var(--d-good)' }
        : { word: 'Not sure: treat with care', c: 'var(--d-unsure)' };
  const pressure = Object.entries(r.pressure).reduce((a, [k, p]) => a + Number(k) * p, 0);
  const dots = Array.from({ length: 5 }, (_, i) => `<i class="${i < Math.round(pressure) ? 'on' : ''}"></i>`).join('');
  const dist = Object.entries(r.kind.dist)
    .sort((a, b) => b[1] - a[1])
    .map(([k, p]) => pbar(k, p))
    .join('');
  out.innerHTML = `
    <div class="verdict" style="--c:${v.c}">
      <div class="word">${v.word}</div>
      <div class="big">${pct(r.likelihood)}<small>scam</small></div>
      <div class="gauge"><i style="left:${(r.likelihood * 100).toFixed(1)}%"></i></div>
    </div>
    <div class="panel-d facts">
      <div class="fact"><h4>Type</h4><button class="badge" id="kindBtn" aria-expanded="false">${esc(r.kind.top)} <span class="mono">${pct(r.kind.p)}</span></button></div>
      <div class="fact"><h4>It wants you to</h4><div class="v">${esc(cap(r.wants))}</div></div>
      <div class="fact"><h4>Pressure</h4><div class="dots" aria-label="Pressure ${Math.round(pressure)} of 5">${dots}</div></div>
      <div class="fact"><h4>Speed</h4><div class="speed"><b>${r.checks} checks</b> in ${secs(roundTrip)}</div></div>
    </div>
    <div class="panel-d" id="kindDist" hidden><h4>Every type it considered</h4>${dist}</div>
    <div class="panel-d"><h4>Red flags</h4>${
      r.flags.length
        ? `<div class="flags">${r.flags.map((f) => `<span class="flag">${esc(f.label)} <span class="mono">${pct(f.p)}</span></span>`).join('')}</div>`
        : '<span class="muted">None found above 60%.</span>'
    }</div>
    ${deeper(`Explain the red flags in this message, what the sender is after, and how to report it:\n\n"${text}"`)}`;
  $('#kindBtn', out).addEventListener('click', (e) => {
    const d = $('#kindDist', out);
    d.hidden = !d.hidden;
    (e.currentTarget as HTMLElement).setAttribute('aria-expanded', String(!d.hidden));
  });
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// — App Privacy X-ray ————————————————————————————————————————
interface AppMeta {
  id: string;
  name: string;
  category: string;
  url: string;
  updated: string;
  clauses: number;
  error?: string;
}
interface Card {
  app: string;
  name: string;
  url: string;
  updated: string;
  clauses: number;
  checks: number;
  ms: number;
  cached: boolean;
  rows: { key: string; good: boolean; p: number; clause: number; evidence: string }[];
  risks: number;
  riskTotal: number;
}

const XQ: Record<string, string> = {
  sells: 'Sells or "shares" your data for ads',
  third_party: 'Shares data with third parties',
  location: 'Collects precise location',
  contacts: 'Collects your contacts',
  biometrics: 'Collects face, voice or biometrics',
  health: 'Collects health or fitness data',
  ai_training: 'Uses your content to train AI',
  retention: 'Keeps data after you delete your account',
  tracking: 'Tracks you across other apps and sites',
  government: 'Discloses to government on request',
  delete: 'Lets you delete your data',
  opt_out: 'Lets you opt out of sale or targeted ads',
};

let apps: AppMeta[] = [];
openers.xray = async () => {
  if (apps.length) return;
  try {
    apps = (await getJson<AppMeta[]>('/demo-data/xray/apps.json')).filter((a) => a.clauses > 0);
  } catch {
    $('#appPicker').innerHTML = '<div class="err">App list is still loading. Try again in a moment.</div>';
    return;
  }
  renderPicker($<HTMLInputElement>('#appSearch').value);
};

interface StoreMatch { id: string; name: string; seller: string; genre: string }
let searchTimer = 0;
let searchController: AbortController | null = null;
let searchVersion = 0;
let xrayVersion = 0;

function renderPicker(q: string) {
  clearTimeout(searchTimer);
  searchController?.abort();
  const version = ++searchVersion;
  const picker = $('#appPicker');
  const needle = q.trim().toLowerCase();
  const list = needle ? apps.filter((a) => a.name.toLowerCase().includes(needle)) : apps;
  const tile = (a: AppMeta) =>
    `<button class="tile" data-app="${esc(a.id)}"><span class="mono-g" style="--h:${hue(a.name)}">${esc(initials(a.name))}</span>${esc(a.name)}</button>`;
  let html = '';
  if (!needle && room?.xray.recent.length) {
    const recent = room.xray.recent.map((id) => apps.find((a) => a.id === id)).filter(Boolean) as AppMeta[];
    if (recent.length) html += `<div class="app-row"><h5>Recently checked in this room</h5><div class="tiles">${recent.map(tile).join('')}</div></div>`;
  }
  const cats = [...new Set(list.map((a) => a.category))];
  html += cats
    .map((c) => `<div class="app-row"><h5>${esc(c)}</h5><div class="tiles">${list.filter((a) => a.category === c).map(tile).join('')}</div></div>`)
    .join('');
  picker.innerHTML = html || '<p class="muted">No ready-to-view match. Type at least two letters to search the App Store.</p>';
  if (needle.length >= 2) {
    picker.insertAdjacentHTML('beforeend', '<div id="storeMatches" class="app-row" aria-live="polite"><h5>App Store · live policy check</h5><p class="muted">Searching the App Store…</p></div>');
    searchTimer = window.setTimeout(() => void searchStore(q.trim(), version), 300);
  }
  picker.hidden = false;
}

async function searchStore(query: string, version: number) {
  const controller = new AbortController();
  searchController = controller;
  try {
    const res = await fetch(`/api/apps/search?q=${encodeURIComponent(query)}`, {
      headers: { 'x-device-id': deviceId() }, signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search could not load. Try again.');
    if (version !== searchVersion) return;
    const matches = (data.apps as StoreMatch[]).filter((a) =>
      !apps.some((local) => local.name.toLowerCase() === a.name.toLowerCase()));
    $('#storeMatches').innerHTML = `<h5>App Store · live policy check</h5>${matches.length
      ? `<p class="muted">New apps usually take 10–40 seconds. Some publishers block policy readers.</p><div class="tiles">${matches.map((a) =>
        `<button class="tile" data-store="${esc(a.id)}" data-name="${esc(a.name)}" title="${esc(a.seller)}"><span class="mono-g" style="--h:${hue(a.name)}">${esc(initials(a.name))}</span>${esc(a.name)}<small class="muted">${esc(a.seller)}</small></button>`).join('')}</div>`
      : '<p class="muted">No additional matches. Try another name or choose a ready-to-view app above.</p>'}`;
  } catch (err) {
    if (controller.signal.aborted || version !== searchVersion) return;
    const out = $('#storeMatches');
    showError(out, err);
    out.insertAdjacentHTML('beforeend', '<button class="btn-d" data-search-retry>Retry search</button>');
  }
}

$('#appSearch').addEventListener('input', (e) => {
  ++xrayVersion;
  $('#xrayOut').innerHTML = '';
  renderPicker((e.target as HTMLInputElement).value);
});
$('#appPicker').addEventListener('click', (e) => {
  const target = e.target as Element;
  if (target.closest('[data-search-retry]')) return renderPicker($<HTMLInputElement>('#appSearch').value);
  const b = target.closest<HTMLElement>('[data-app], [data-store]');
  if (b) void runXray(b.dataset.app || b.dataset.store!, !!b.dataset.store, b.dataset.name);
});

async function runXray(id: string, fromStore = false, name?: string) {
  const a = apps.find((x) => x.id === id);
  if (!fromStore && !a) return;
  const version = ++xrayVersion;
  clearTimeout(searchTimer);
  searchController?.abort();
  ++searchVersion;
  const out = $('#xrayOut');
  $('#appPicker').hidden = true;
  const label = fromStore ? name || 'This app' : a!.name;
  out.innerHTML = `<div class="panel-d" role="status"><h3>${esc(label)}</h3><p class="muted">${fromStore
    ? 'Reading the privacy policy and checking its clauses… Usually 10–40 seconds.'
    : 'Loading the saved policy analysis…'}</p></div>`;
  const started = performance.now();
  try {
    const r = await api<Card>('/api/tools/xray', fromStore ? { store: id } : { app: id }, (msg) => {
      if (version === xrayVersion) out.innerHTML = `<div class="panel-d" role="status">${esc(msg)}</div>`;
    });
    if (version !== xrayVersion) return;
    renderXray(out, r, r.cached ? null : performance.now() - started);
  } catch (e) {
    if (version !== xrayVersion) return;
    showError(out, e);
    out.insertAdjacentHTML('beforeend', '<button class="btn-d" id="xrayBack">Choose another app</button>');
    $('#xrayBack').addEventListener('click', () => {
      out.innerHTML = '';
      renderPicker($<HTMLInputElement>('#appSearch').value);
    });
  }
  reveal(out);
}

function renderXray(out: HTMLElement, r: Card, ms: number | null) {
  const risky = r.rows.filter((x) => !x.good && x.p >= 0.6).sort((a, b) => b.p - a.p);
  const light = (x: Card['rows'][number]) =>
    x.good
      ? x.p >= 0.6
        ? 'var(--d-good)'
        : x.p >= 0.4
          ? 'var(--d-unsure)'
          : 'var(--d-border)'
      : x.p >= 0.6
        ? 'var(--d-bad)'
        : x.p >= 0.4
          ? 'var(--d-unsure)'
          : 'var(--d-good)';
  out.innerHTML = `
    <div class="panel-d">
      <div class="x-head"><span class="mono-g" style="--h:${hue(r.name)}">${esc(initials(r.name))}</span>
        <div><h3>${esc(r.name)}</h3><p>Policy ${esc(r.updated || 'date not stated')} · <a href="${esc(r.url)}" target="_blank" rel="noopener">source</a></p></div></div>
      <p class="speed" style="margin:12px 0 0"><b>${fmt(r.clauses)} clauses × 12 questions = ${fmt(r.checks)} checks</b> ${ms == null ? '· saved analysis, each flag double-checked' : `in ${secs(ms)}`}</p>
    </div>
    <div class="verdict" style="--c:${r.risks >= 7 ? 'var(--d-bad)' : r.risks >= 4 ? 'var(--d-unsure)' : 'var(--d-good)'}">
      <div class="word">${r.risks} of ${r.riskTotal} risk signals found</div>
      <p class="muted" style="margin:8px 0 0">${risky.length ? `Worst: ${risky.slice(0, 3).map((x) => esc(XQ[x.key])).join(' · ')}` : 'No strong risk signals.'}</p>
    </div>
    <div class="panel-d">${r.rows
      .map(
        (x, i) => `<div class="qrow" style="--c:${light(x)}">
          <button aria-expanded="false" data-row="${i}"><span class="light"></span><span class="q">${esc(XQ[x.key])}${x.good ? ' <span class="muted">(good)</span>' : ''}</span><span class="p">${pct(x.p)}</span></button>
          <div class="evidence" hidden>“${esc(x.evidence)}”<br /><a href="${esc(r.url)}" target="_blank" rel="noopener">Read the policy</a></div>
        </div>`,
      )
      .join('')}</div>
    <button class="btn-d" id="pickAnother">Check another app</button>
    ${deeper(
      `Here are clauses from the ${r.name} privacy policy that an AI flagged. Explain the practical privacy risk of each in plain English, and tell me exactly which settings to change in the ${r.name} app to reduce it:\n\n${risky
        .slice(0, 5)
        .map((x) => `- ${XQ[x.key]}: "${x.evidence}"`)
        .join('\n')}`,
    )}`;
  $$('[data-row]', out).forEach((b) =>
    b.addEventListener('click', () => {
      const ev = b.nextElementSibling as HTMLElement;
      ev.hidden = !ev.hidden;
      b.setAttribute('aria-expanded', String(!ev.hidden));
    }),
  );
  $('#pickAnother', out).addEventListener('click', () => {
    out.innerHTML = '';
    $('#appPicker').hidden = false;
    void renderPicker($<HTMLInputElement>('#appSearch').value);
  });
}

// — Job Radar ——————————————————————————————————————————————
type JobIdx = [string, string, string[]];
interface JobRes {
  code: string;
  title: string;
  tasks: { id: number; t: string; bucket: string; p: number; exposure: number; borderline: boolean }[];
  split: Record<string, number>;
  exposure: number;
  percentile: number | null;
  checks: number;
  ms: number;
  cached: boolean;
}

const JOB_CHIPS: [string, string][] = [
  ['Information Security Analyst', '15-1212.00'],
  ['IT Auditor', '15-1211.00'],
  ['Compliance Officer', '13-1041.00'],
  ['Risk Analyst', '13-2054.00'],
  ['Network Administrator', '15-1244.00'],
  ['IT Project Manager', '15-1299.09'],
];
$('#jobChips').innerHTML = JOB_CHIPS.map(([t, c]) => `<button class="chip" data-code="${c}" data-label="${esc(t)}">${esc(t)}</button>`).join('');

let jobs: JobIdx[] = [];
openers.jobs = async () => {
  if (!jobs.length) jobs = await getJson<JobIdx[]>('/demo-data/jobs/index.json').catch(() => []);
};

function searchJobs(q: string) {
  const n = q.trim().toLowerCase();
  if (n.length < 2) return [];
  const scored: { j: JobIdx; s: number; via?: string }[] = [];
  for (const j of jobs) {
    const title = j[1].toLowerCase();
    let s = title.startsWith(n) ? 100 : title.includes(n) ? 60 : 0;
    let via: string | undefined;
    for (const alt of j[2]) {
      const a = alt.toLowerCase();
      const as = a === n ? 120 : a.startsWith(n) ? 80 : a.includes(n) ? 40 : 0;
      if (as > s) {
        s = as;
        via = alt;
      }
    }
    if (s) scored.push({ j, s: s - title.length / 100, via });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, 8);
}

const jobInput = $<HTMLInputElement>('#jobSearch');
const jobList = $('#jobList');
let active = -1;
jobInput.addEventListener('input', () => {
  const res = searchJobs(jobInput.value);
  active = -1;
  jobList.innerHTML = res
    .map(
      (r, i) =>
        `<li role="option" id="jo${i}" aria-selected="false" data-code="${r.j[0]}" data-label="${esc(r.j[1])}">${esc(r.j[1])}${r.via ? `<small>matches “${esc(r.via)}”</small>` : ''}</li>`,
    )
    .join('');
  jobList.hidden = !res.length;
  jobInput.setAttribute('aria-expanded', String(!!res.length));
});
jobInput.addEventListener('keydown', (e) => {
  const items = $$('li', jobList);
  if (!items.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    jobInput.setAttribute('aria-activedescendant', items[active].id);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const li = items[Math.max(active, 0)];
    void pickJob(li.dataset.code!, li.dataset.label!);
  }
});
jobList.addEventListener('click', (e) => {
  const li = (e.target as Element).closest<HTMLElement>('li');
  if (li) void pickJob(li.dataset.code!, li.dataset.label!);
});
$('#jobChips').addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-code]');
  if (b) void pickJob(b.dataset.code!, b.dataset.label!);
});

async function pickJob(code: string, label: string) {
  jobList.hidden = true;
  jobInput.value = label;
  jobInput.setAttribute('aria-expanded', 'false');
  const out = $('#jobsOut');
  const t = ticker(out, 50, `Sorting every task a ${label} does`, 1500);
  const started = performance.now();
  try {
    const r = await api<JobRes>('/api/tools/jobs', { code }, t.retry);
    t.stop();
    if (r.cached) await countUp(out, r.checks, 900);
    renderJobs(out, r, r.cached ? null : performance.now() - started);
    reveal(out);
  } catch (e) {
    t.stop();
    showError(out, e);
  }
}

function renderJobs(out: HTMLElement, r: JobRes, ms: number | null) {
  const B = ['Automate', 'Augment', 'Own'];
  const split = B.map(
    (b) =>
      `<span class="b-${b}" style="width:${(r.split[b] * 100).toFixed(1)}%" title="${b} ${pct(r.split[b])}">${
        r.split[b] >= 0.28 ? `${b} ${pct(r.split[b])}` : r.split[b] >= 0.08 ? pct(r.split[b]) : ''
      }</span>`,
  ).join('');
  const col = (b: string) => {
    const ts = r.tasks.filter((t) => t.bucket === b).sort((x, y) => y.p - x.p);
    return `<div class="panel-d col b-${b}"><h4>${b} · ${ts.length}</h4>${
      ts
        .map(
          (t) =>
            `<div class="task">${esc(t.t)}${t.borderline ? '<span class="tag-b">borderline</span>' : ''}<div class="conf"><i style="width:${(t.p * 100).toFixed(0)}%"></i></div></div>`,
        )
        .join('') || '<p class="muted">None</p>'
    }</div>`;
  };
  const auto = r.tasks.filter((t) => t.bucket === 'Automate').sort((a, b) => b.p - a.p);
  out.innerHTML = `
    <div class="panel-d">
      <h3 style="margin:0;font-size:22px">${esc(r.title)}</h3>
      <p class="speed" style="margin:6px 0 12px"><b>${r.tasks.length} tasks sorted</b> ${ms == null ? '· part of a run over all 923 jobs' : `in ${secs(ms)}`}</p>
      <div class="split">${split}</div>
      <p style="margin:12px 0 0;font-size:15px">${
        r.percentile != null ? `More exposed to AI than <b>${pct(r.percentile)}</b> of jobs.` : `Average exposure ${r.exposure.toFixed(1)} of 5.`
      }</p>
    </div>
    <p class="credit" style="margin:-4px 0 0">${B.map((b) => `<span class="b-${b}" style="color:var(--c)">■</span> ${b} ${pct(r.split[b])}`).join(' &nbsp; ')}</p>
    <div class="cols">${B.map(col).join('')}</div>
    <p class="credit">Task data: O*NET 31.0 Database, U.S. Department of Labor, ETA (CC BY 4.0).</p>
    ${deeper(
      `I'm a ${r.title}. An AI sorted my job's tasks and says these could be automated end to end with a human check:\n\n${auto
        .slice(0, 6)
        .map((t) => `- ${t.t}`)
        .join('\n')}\n\nDraft a practical plan to automate the top one this month: tools, steps, the check a human keeps, and the risks to watch.`,
    )}`;
}

// — Make your own check ————————————————————————————————————————
interface CQ {
  type: 'noul' | 'choice' | 'score';
  q: string;
  options?: string;
}
const PRESETS: Record<string, { text: string; qs: CQ[] }> = {
  vendor: {
    text: 'We take security seriously. Customer data is encrypted and we are working toward SOC 2. Backups are stored with a trusted partner and access is limited to staff who need it.',
    qs: [
      { type: 'noul', q: 'Does this answer give verifiable evidence (a certification, report or control) rather than assurances?' },
      { type: 'score', q: 'How complete is this answer for a security questionnaire?' },
      { type: 'choice', q: 'What should the reviewer do next?', options: 'accept, ask a follow-up, escalate to risk' },
    ],
  },
  log: {
    text: '2026-09-30T02:14:07Z sshd[2211]: Accepted password for admin from 185.220.101.42 port 51544 ssh2',
    qs: [
      { type: 'noul', q: 'Is this log line likely to indicate malicious activity?' },
      { type: 'choice', q: 'Which category fits best?', options: 'authentication, malware, data exfiltration, configuration change, benign' },
      { type: 'score', q: 'How urgent is it to investigate?' },
    ],
  },
  email: {
    text: 'Hi, it\'s Sarah (CFO). I\'m in meetings all day. Please wire $48,500 to our new vendor today; bank details attached. Keep this between us until the deal is announced.',
    qs: [
      { type: 'noul', q: 'Is this likely a business email compromise attempt?' },
      { type: 'choice', q: 'What is the safest response?', options: 'pay it, verify by phone using a known number, reply to the email to confirm' },
    ],
  },
};

let cqs: CQ[] = [{ type: 'noul', q: '' }];

function renderCqs() {
  $('#customQs').innerHTML = cqs
    .map(
      (q, i) => `<div class="cq" data-i="${i}">
        <div class="cq-top"><input type="text" data-f="q" value="${esc(q.q)}" placeholder="Question ${i + 1}, e.g. Is this asking for money?" maxlength="240" />
        <select data-f="type" aria-label="Question type">
          <option value="noul"${q.type === 'noul' ? ' selected' : ''}>Yes / No</option>
          <option value="choice"${q.type === 'choice' ? ' selected' : ''}>Pick one</option>
          <option value="score"${q.type === 'score' ? ' selected' : ''}>Score 1–5</option>
        </select></div>
        ${q.type === 'choice' ? `<input type="text" data-f="options" value="${esc(q.options ?? '')}" placeholder="Options, comma separated" />` : ''}
        ${cqs.length > 1 ? '<button class="rm" data-rm>Remove</button>' : ''}
      </div>`,
    )
    .join('');
  $('#addQ').hidden = cqs.length >= 4;
}
renderCqs();

$('#customQs').addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  const i = Number(el.closest<HTMLElement>('.cq')!.dataset.i);
  const f = el.dataset.f as keyof CQ;
  (cqs[i] as unknown as Record<string, string>)[f] = el.value;
  if (f === 'type') renderCqs();
});
$('#customQs').addEventListener('click', (e) => {
  const rm = (e.target as Element).closest('[data-rm]');
  if (!rm) return;
  cqs.splice(Number(rm.closest<HTMLElement>('.cq')!.dataset.i), 1);
  renderCqs();
});
$('#addQ').addEventListener('click', () => {
  cqs.push({ type: 'noul', q: '' });
  renderCqs();
});
$('#customPresets').addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-preset]');
  if (!b) return;
  const p = PRESETS[b.dataset.preset!];
  $<HTMLTextAreaElement>('#customText').value = p.text;
  cqs = p.qs.map((q) => ({ ...q }));
  renderCqs();
});
$('#customGo').addEventListener('click', () => void runCustom());

async function runCustom() {
  const text = $<HTMLTextAreaElement>('#customText').value.trim();
  const qs = cqs.filter((q) => q.q.trim());
  if (!text) return toast('Add some text first');
  if (!qs.length) return toast('Write at least one question');
  const out = $('#customOut');
  const btn = $<HTMLButtonElement>('#customGo');
  btn.disabled = true;
  const t = ticker(out, qs.length, `${qs.length} question${qs.length > 1 ? 's' : ''}, one call`, 600);
  const started = performance.now();
  try {
    const r = await api<{ answers: (number | Dist)[]; checks: number; ms: number }>(
      '/api/tools/custom',
      {
        text,
        questions: qs.map((q) => ({
          type: q.type,
          q: q.q,
          options: q.type === 'choice' ? (q.options ?? '').split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        })),
      },
      t.retry,
    );
    t.stop();
    const ms = performance.now() - started;
    out.innerHTML =
      qs
        .map((q, i) => {
          const a = r.answers[i];
          const body =
            typeof a === 'number'
              ? `<div class="big mono" style="font-size:40px;font-weight:600">${pct(a)} <span class="muted" style="font-size:15px">yes</span></div>${pbar('yes', a, a >= 0.6 ? 'var(--d-bad)' : a <= 0.4 ? 'var(--d-good)' : 'var(--d-unsure)')}`
              : Object.entries(a)
                  .sort((x, y) => (q.type === 'score' ? Number(x[0]) - Number(y[0]) : y[1] - x[1]))
                  .map(([k, p]) => pbar(q.type === 'score' ? `${k} of 5` : k, p))
                  .join('');
          return `<div class="panel-d"><h4>${esc(q.q)}</h4>${body}</div>`;
        })
        .join('') + `<p class="speed"><b>${r.checks} checks</b> in ${secs(ms)}</p>`;
    reveal(out);
  } catch (e) {
    t.stop();
    showError(out, e);
  } finally {
    btn.disabled = false;
  }
}

// — Build panel ————————————————————————————————————————————
let token = '';
let modelId = 'MODEL_ID';

fetch('/api/v1/models')
  .then((r) => r.json())
  .then((d: { data?: { id: string }[] }) => {
    if (d.data?.[0]) {
      modelId = d.data[0].id;
      tokenize();
    }
  })
  .catch(() => {});

const originals = new Map<HTMLElement, string>();
function tokenize() {
  $$('[data-tokenize], #envBlock, [data-token-text], [data-model-text]').forEach((el) => {
    if (!originals.has(el)) originals.set(el, el.textContent ?? '');
    el.textContent = originals
      .get(el)!
      .replaceAll('tmx_your_token_here', token || 'tmx_your_token_here')
      .replaceAll('MODEL_ID', modelId);
  });
  const prompt = $('#starterPrompt').textContent ?? '';
  $<HTMLAnchorElement>('#starterClaude').href = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
  $<HTMLAnchorElement>('#starterGpt').href = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
  $('#starterClaude').dataset.copyText = prompt;
  $('#starterGpt').dataset.copyText = prompt;
}
tokenize();

$('#getToken').addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  btn.disabled = true;
  try {
    const r = await api<{ token: string; expires: number; cap: number }>('/api/token', {});
    token = r.token;
    const out = $('#tokenOut');
    out.textContent = token;
    out.hidden = false;
    $('#copyToken').hidden = false;
    btn.textContent = 'Your token';
    tokenize();
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Could not get a token');
    btn.disabled = false;
  }
});
$('#copyToken').addEventListener('click', () => void copy(token, 'Token copied'));

$$<HTMLButtonElement>('.tabs [role="tab"]').forEach((tab) =>
  tab.addEventListener('click', () => {
    $$('.tabs [role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    $$('.tabpanel').forEach((p) => (p.hidden = p.id !== tab.dataset.tab));
  }),
);

$$('[data-copy]').forEach((pre) => {
  const b = document.createElement('button');
  b.className = 'btn-d small copy-btn';
  b.textContent = 'Copy';
  b.addEventListener('click', () => void copy(pre.querySelector('code')?.textContent ?? ''));
  pre.appendChild(b);
});

// — Room pulse (header stat + "recent apps") ——————————————————
interface Room {
  totals: { decisions: number; people: number };
  xray: { recent: string[] };
}
let room: Room | null = null;
async function pollRoom() {
  try {
    room = await getJson<Room>('/api/wall');
    if (room.totals.decisions)
      $('#roomStat').textContent = `${fmt(room.totals.decisions)} decisions · ${room.totals.people} ${room.totals.people === 1 ? 'person' : 'people'} in the room`;
  } catch {
    /* offline or not deployed: stay quiet */
  }
}
void pollRoom();
setInterval(() => document.visibilityState === 'visible' && void pollRoom(), 10_000);

// Open deep links only after all tool openers and state are initialized.
if (TITLES[location.hash.slice(1)]) openSheet(location.hash.slice(1), false);
