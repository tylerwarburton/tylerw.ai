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

// Each tool has a dedicated page. Old hash links redirect to those pages.
const TITLES: Record<string, string> = { scam: 'Scam Check', xray: 'App Privacy X-ray', jobs: 'Job Radar', custom: 'Make your own check' };
const openers: Record<string, () => void> = {};
const pageTool = $('#demo').dataset.tool || '';
if (!pageTool && TITLES[location.hash.slice(1)]) location.replace(`/demo/${location.hash.slice(1)}/`);

// — Shared result pieces ——————————————————————————————————————
function ticker(el: HTMLElement, _total: number, label: string, _expectMs: number) {
  el.innerHTML = `<div class="panel-d" role="status"><p class="muted">${esc(label)} · Running live…</p></div>`;
  return { retry(msg: string) { el.innerHTML = `<div class="panel-d" role="status">${esc(msg)}</div>`; }, stop() {} };
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

interface StoreMatch { id: string; name: string; seller: string; genre: string; icon?: string }
let searchTimer = 0;
let searchController: AbortController | null = null;
let searchVersion = 0;
let xrayVersion = 0;
openers.xray = () => renderPicker($<HTMLInputElement>('#appSearch').value);
function appIcon(icon: string | undefined, name: string) {
  return icon ? `<img class="app-icon" src="${esc(icon)}" alt="" width="56" height="56" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="mono-g" style="--h:${hue(name)}">${esc(initials(name))}</span>`;
}
function renderPicker(q: string) {
  clearTimeout(searchTimer);
  searchController?.abort();
  const version = ++searchVersion;
  const picker = $('#appPicker');
  picker.hidden = false;
  if (q.trim().length < 2) {
    picker.innerHTML = '<p class="muted">Search the App Store by name. Every policy analysis runs live when you select an app.</p>';
    return;
  }
  picker.innerHTML = '<div id="storeMatches" class="app-row" aria-live="polite"><p class="muted">Searching the App Store…</p></div>';
  searchTimer = window.setTimeout(() => void searchStore(q.trim(), version), 300);
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
    const matches = data.apps as StoreMatch[];
    $('#storeMatches').innerHTML = `<h5>App Store · live policy check</h5>${matches.length
      ? `<p class="muted">Live analysis usually takes 10–40 seconds. Some publishers block policy readers.</p><div class="tiles">${matches.map((a) =>
        `<button class="tile" data-store="${esc(a.id)}" data-name="${esc(a.name)}" title="${esc(a.seller)}">${appIcon(a.icon, a.name)}<span class="app-copy"><b>${esc(a.name)}</b><small class="muted">${esc(a.seller)}</small></span></button>`).join('')}</div>`
      : '<p class="muted">No matches. Try another app name.</p>'}`;
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
  const b = target.closest<HTMLElement>('[data-store]');
  if (b) void runXray(b.dataset.store!, b.dataset.name);
});

async function runXray(id: string, name?: string) {
  const version = ++xrayVersion;
  clearTimeout(searchTimer);
  searchController?.abort();
  ++searchVersion;
  const out = $('#xrayOut');
  $('#appPicker').hidden = true;
  const label = name || 'This app';
  out.innerHTML = `<div class="panel-d" role="status"><h3>${esc(label)}</h3><p class="muted">Reading the privacy policy and running live checks… Usually 10–40 seconds.</p></div>`;
  const started = performance.now();
  try {
    const r = await api<Card>('/api/tools/xray', { store: id }, (msg) => {
      if (version === xrayVersion) out.innerHTML = `<div class="panel-d" role="status">${esc(msg)}</div>`;
    });
    if (version !== xrayVersion) return;
    renderXray(out, r, performance.now() - started);
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
      <p class="speed" style="margin:12px 0 0"><b>${fmt(r.clauses)} clauses × 12 questions = ${fmt(r.checks)} checks</b> ${ms == null ? '' : `· live in ${secs(ms)}`}</p>
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

$('#manualJob').addEventListener('click', () => {
  $('#jobReview').hidden = false;
  reveal($('#jobReview'));
});
$('#extractJob').addEventListener('click', async () => {
  const profile = $<HTMLTextAreaElement>('#jobProfile').value.trim();
  if (profile.length < 80) return toast('Paste your profile or work description first');
  const btn = $<HTMLButtonElement>('#extractJob');
  const out = $('#jobExtractStatus');
  btn.disabled = true;
  const t = ticker(out, 0, 'Reading your work experience', 0);
  try {
    const r = await api<{ title: string; tasks: string[] }>('/api/tools/jobs', { action: 'extract', profile }, t.retry);
    $<HTMLInputElement>('#jobSearch').value = r.title;
    $<HTMLTextAreaElement>('#jobTasks').value = r.tasks.join('\n');
    $('#jobReview').hidden = false;
    $('#jobsOut').innerHTML = '';
    out.innerHTML = '';
    reveal($('#jobReview'));
  } catch (e) { showError(out, e); }
  finally { btn.disabled = false; }
});
$('#jobsGo').addEventListener('click', async () => {
  const title = $<HTMLInputElement>('#jobSearch').value.trim();
  const tasks = $<HTMLTextAreaElement>('#jobTasks').value.trim();
  if (!title || !tasks) return toast('Enter your job title and responsibilities');
  const btn = $<HTMLButtonElement>('#jobsGo');
  btn.disabled = true;
  const out = $('#jobsOut');
  const t = ticker(out, 0, 'Analyzing your responsibilities', 0);
  const started = performance.now();
  try {
    const r = await api<JobRes>('/api/tools/jobs', { title, tasks }, t.retry);
    renderJobs(out, r, performance.now() - started);
    reveal(out);
  } catch (e) { showError(out, e); }
  finally { btn.disabled = false; }
});

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
      <p class="speed" style="margin:6px 0 12px"><b>${r.tasks.length} tasks sorted</b> ${ms == null ? '' : `· live in ${secs(ms)}`}</p>
      <div class="split">${split}</div>
      <p style="margin:12px 0 0;font-size:15px">${
        r.percentile != null ? `More exposed to AI than <b>${pct(r.percentile)}</b> of jobs.` : `Average exposure ${r.exposure.toFixed(1)} of 5.`
      }</p>
    </div>
    <p class="credit" style="margin:-4px 0 0">${B.map((b) => `<span class="b-${b}" style="color:var(--c)">■</span> ${b} ${pct(r.split[b])}`).join(' &nbsp; ')}</p>
    <div class="cols">${B.map(col).join('')}</div>
    <p class="credit">Based on the responsibilities you entered. AI estimates describe tasks, not whether your job will disappear.</p>
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
if (pageTool) openers[pageTool]?.();
