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
    public runUsage?: RunUsage,
  ) {
    super(message);
  }
}

interface ModelStage {kind:"decision"|"text";model:string;costUsd:number;costComplete:boolean;elapsedMs:number;inputTokens:number;outputTokens:number;decisions:number;status:"ok"|"failed"}
interface RunUsage { stages?:ModelStage[]; costUsd:number; costComplete:boolean; elapsedMs:number; calls:number; inputTokens:number; outputTokens:number }
function updateReceipt(r: {runUsage?:RunUsage}) {
  const u = r.runUsage;
  if (!u) return;
  const header=$('#runReceipt');
  header.hidden=false;
  const stageSummary=(["decision","text"] as const).map(kind=>{const calls=(u.stages||[]).filter(s=>s.kind===kind);if(!calls.length)return "";const ms=calls.reduce((n,s)=>n+s.elapsedMs,0);const cost=calls.reduce((n,s)=>n+s.costUsd,0);return `<span title="Sum of API call times, including retries. Total time also includes fetching data and network overhead.">${kind==="decision"?"Jev decisions":"LLM text"} · ${ms<1000?`${ms} ms`:secs(ms)} API · $${cost.toFixed(6)}${calls.every(s=>s.costComplete)?"":" reported"}</span>`;}).filter(Boolean).join("");
  header.innerHTML = `<div class="run-receipt"><span>${u.costComplete ? '' : 'Reported portion: '}$${u.costUsd.toFixed(6)} USD${u.costComplete ? '' : ' · cost incomplete'}</span><span>${secs(u.elapsedMs)} total time</span><span>${fmt(u.inputTokens + u.outputTokens)} tokens</span></div><div class="engine-usage">${stageSummary}</div>`;
}
async function api<T>(path: string, payload: unknown, onRetry?: (msg: string) => void): Promise<T & {runUsage:RunUsage}> {
  const started = performance.now();
  const usage:RunUsage = {costUsd:0,costComplete:true,elapsedMs:0,calls:0,inputTokens:0,outputTokens:0};
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(path, { method:'POST', headers:{'content-type':'application/json','x-device-id':deviceId()}, body:JSON.stringify(payload) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (data.runUsage) {
      const u = data.runUsage;
      usage.costUsd += u.costUsd; usage.calls += u.calls;
      (usage.stages??=[]).push(...(u.stages||[]));
      usage.inputTokens += u.inputTokens; usage.outputTokens += u.outputTokens;
      usage.costComplete &&= u.costComplete;
    } else if (!res) usage.costComplete = false;
    usage.elapsedMs = performance.now() - started;
    void pollPersonal();
    if(data.runUsage) updateReceipt({runUsage:usage});
    if (res?.ok) return {...data,runUsage:usage};
    const status = res?.status ?? 0;
    // A lost response might already have incurred cost: do not repeat it automatically.
    if (path !== '/api/tools/xray' && data.retryable !== false && (status === 429 || status === 503) && attempt < 2) {
      onRetry?.(`${data.error || 'The request could not finish.'} Retrying…`);
      await new Promise(r => setTimeout(r,(attempt+2)*1000)); continue;
    }
    throw new ApiError(status,data.error || 'Connection interrupted. Please try again.',usage);
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

type EmailCheck = Partial<ScamResult> & {priority?:Dist; probability?:number; stage:string; label?:string; pass:boolean; stopped:boolean; band?:string; likelihood?:number; runUsage?:RunUsage};
const emailStages = ['scam','spam','priority'];
let emailResults:EmailCheck[] = [];
let emailText = '';
let emailBusy = false;
let emailError = '';
let emailFailureUsage:RunUsage|undefined;
function renderEmail() {
  const expanded=new Set($$<HTMLDetailsElement>('#scamOut details[open]').map(el=>el.dataset.stage));
  const usages=[...emailResults.map(r=>r.runUsage),emailFailureUsage].filter((u):u is RunUsage=>!!u);
  const total=usages.reduce<RunUsage>((a,u)=>({stages:[...(a.stages||[]),...(u.stages||[])],costUsd:a.costUsd+u.costUsd,elapsedMs:a.elapsedMs+u.elapsedMs,costComplete:a.costComplete&&u.costComplete,calls:a.calls+u.calls,inputTokens:a.inputTokens+u.inputTokens,outputTokens:a.outputTokens+u.outputTokens}),{costUsd:0,elapsedMs:0,costComplete:true,calls:0,inputTokens:0,outputTokens:0});
  $('#scamOut').innerHTML = emailStages.map((stage,i) => {
    const r = emailResults[i];
    const blocked = emailResults.some(x => x.stopped);
    const label = r ? r.label || (r.band === 'legit' ? 'No strong scam signals' : r.band === 'scam' ? 'Likely scam' : 'Uncertain — verify the sender') : blocked ? 'Not run — an earlier check stopped the sequence' : emailBusy && i === emailResults.length ? 'Running live…' : 'Not run';
    const score=stage==='scam' ? r?.likelihood ?? 0 : r?.probability ?? 0;
    const color=score >= .75 ? 'var(--d-bad)' : score > .25 ? 'var(--d-unsure)' : 'var(--d-good)';
    const visual = r && stage === 'scam' ? '<div id="emailScamVisual" class="email-scam-visual"></div>'
      : r && stage === 'spam' ? `<div class="email-filter-result" style="--c:${color}"><strong>${esc(label)}</strong><div class="email-filter-number">${pct(r.probability || 0)}<small>spam likelihood</small></div>${pbar('Spam signals',r.probability || 0,color)}</div>`
      : r && stage === 'priority' ? `<div class="email-priority-options">${['urgent action','routine action','information only'].map((option,j)=>`<div class="email-priority-option ${r.label===option ? 'selected' : ''}" style="--c:${['var(--d-unsure)','var(--d-accent)','var(--d-good)'][j]}"><span aria-hidden="true">${['!','↗','i'][j]}</span><strong>${cap(option)}</strong><small>${['Time-sensitive action','Action without immediate urgency','Read when convenient'][j]}</small>${r.label===option ? '<b>Selected</b>' : ''}</div>`).join('')}</div>`
      : `<p>${esc(label)}</p>`;
    if (!r) return `<section class="email-stage email-pending"><h3>${i+1}. ${cap(stage)}</h3><p>${esc(label)}</p></section>`;
    const metric=stage==='priority' ? 'urgent action' : stage;
    const breakdown=stage==='priority' && r.priority ? `<div class="panel-d">${Object.entries(r.priority).map(([k,p])=>pbar(cap(k),p)).join('')}</div>` : '';
    return `<details class="email-stage email-collapsible" data-stage="${stage}" style="--c:${color}"${expanded.has(stage) ? ' open' : ''}>
      <summary><span class="email-summary-label">${i+1}. ${cap(stage)}</span><strong class="email-summary-verdict">${esc(cap(label))}</strong><span class="email-summary-score">${pct(score)}<small>${metric}</small></span><span class="gauge"><i style="left:${score*100}%"></i></span><span class="email-expand-hint"><span class="when-closed">Click to see more ↓</span><span class="when-open">Hide details ↑</span></span></summary>
      <div class="email-expanded">${visual}${breakdown}</div></details>`;
  }).join('') + '' + (emailError ? `<div class="err">${esc(emailError)}</div>` : '') + '<p class="credit">Text-only AI assessment. It cannot authenticate a sender or verify links. Confirm sensitive requests through a trusted channel.</p>';
  if (usages.length) updateReceipt({runUsage:total});
  const scam = emailResults[0];
  if (scam?.kind && scam.pressure && scam.flags) renderScam($('#emailScamVisual'),scam as ScamResult,scam.runUsage?.elapsedMs || scam.ms || 0,emailText);
  $<HTMLButtonElement>('#scamGo').disabled = emailBusy || emailResults.some(r => r.stopped) || emailResults.length === 3;
  $<HTMLButtonElement>('#scamNext').disabled = $<HTMLButtonElement>('#scamGo').disabled;
}
$('#scamText').addEventListener('input',() => {
  if (emailBusy) return;
  emailResults=[]; emailError=''; emailFailureUsage=undefined; renderEmail();
});
$('#scamGo').addEventListener('click',() => void runEmail(true));
$('#scamNext').addEventListener('click',() => void runEmail(false));
async function runEmail(all:boolean) {
  if (emailBusy) return;
  const input = $<HTMLTextAreaElement>('#scamText');
  const text = input.value.trim();
  if (text.length < 8) return toast('Paste an email first');
  if (text !== emailText) {emailResults=[]; emailText=text;}
  emailBusy=true; input.disabled=true; emailError=''; renderEmail();
  try {
    do {
      const stage=emailStages[emailResults.length];
      if (!stage || emailResults.some(r => r.stopped)) break;
      const r=await api<EmailCheck>('/api/tools/scam',{text,stage});
      emailResults.push(r); renderEmail();
    } while(all);
  } catch(e) {emailError=e instanceof Error ? e.message : 'Check failed. Try again.'; if(e instanceof ApiError) emailFailureUsage=e.runUsage;}
  finally {emailBusy=false;input.disabled=false;renderEmail();}
}

function renderScam(out: HTMLElement, r: ScamResult, roundTrip: number, text: string) {
  const v =
    r.band === 'scam'
      ? { word: 'Likely scam', c: 'var(--d-bad)' }
      : r.band === 'legit'
        ? { word: 'No strong scam signals', c: 'var(--d-good)' }
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
  rows: { key: string; good: boolean; clause: number; evidence: string; assessment?:string; summary?:string }[];
  risks: number;
  riskTotal: number;
}

const XQ: Record<string, string> = {
  sells: 'Sale or advertising-related sharing',
  third_party: 'Third-party sharing',
  location: 'Precise location',
  contacts: 'Contacts and address book',
  biometrics: 'Biometric information',
  health: 'Health and fitness information',
  ai_training: 'AI training',
  retention: 'Retention after account deletion',
  tracking: 'Cross-site and cross-app tracking',
  government: 'Government and legal disclosures',
  delete: 'Data deletion controls',
  opt_out: 'Sale or advertising opt-out controls',
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
  if (q.trim().length < 1) {
    picker.innerHTML = '<p class="muted">Search the App Store by name. Every policy analysis runs live when you select an app.</p>';
    return;
  }
  picker.innerHTML = '<div id="storeMatches" class="app-row" aria-live="polite"><p class="muted">Waiting for you to finish typing…</p></div>';
  searchTimer = window.setTimeout(() => void searchStore(q.trim(), version), 2000);
}

async function searchStore(query: string, version: number) {
  if(version !== searchVersion) return;
  const target=$('#storeMatches');
  if(target) target.innerHTML='<p class="muted">Searching the App Store…</p>';
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
        `<button class="tile" data-store="${esc(a.id)}" data-name="${esc(a.name)}" data-icon="${esc(a.icon || '')}" title="${esc(a.seller)}">${appIcon(a.icon, a.name)}<span class="app-copy"><b>${esc(a.name)}</b><small class="muted">${esc(a.seller)}</small></span></button>`).join('')}</div>`
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
  if (b) void runXray(b.dataset.store!, b.dataset.name, b.dataset.icon);
});

async function runXray(id: string, name?: string, icon?:string) {
  const version = ++xrayVersion;
  clearTimeout(searchTimer);
  searchController?.abort();
  ++searchVersion;
  const out = $('#xrayOut');
  $('#appPicker').hidden = true;
  const label = name || 'This app';
  out.innerHTML = `<div class="panel-d" role="status"><div class="app-brand">${appIcon(icon,label)}<h3>${esc(label)}</h3></div><p class="scan-loading"><span class="scan-spinner" aria-hidden="true"></span>Reading the privacy policy and running live checks…</p></div>`;
  const started = performance.now();
  try {
    const r = await api<Card>('/api/tools/xray', { store: id }, (msg) => {
      if (version === xrayVersion) out.innerHTML = `<div class="panel-d" role="status"><div class="app-brand">${appIcon(icon,label)}<h3>${esc(label)}</h3></div><p class="scan-loading"><span class="scan-spinner" aria-hidden="true"></span>${esc(msg)}</p></div>`;
    });
    if (version !== xrayVersion) return;
    renderXray(out, r, performance.now() - started, icon);
  } catch (e) {
    if (version !== xrayVersion) return;
    showError(out, e);
    out.insertAdjacentHTML('afterbegin', `<div class="app-brand">${appIcon(icon,label)}<h3>${esc(label)}</h3></div>`);
    out.insertAdjacentHTML('beforeend', '<div class="deeper"><button class="btn-d primary" id="xrayRetry">Retry this app</button><button class="btn-d" id="xrayBack">Choose another app</button></div>');
    $('#xrayRetry').addEventListener('click', () => void runXray(id,name,icon));
    $('#xrayBack').addEventListener('click', () => {
      out.innerHTML = '';
      renderPicker($<HTMLInputElement>('#appSearch').value);
    });
  }
  reveal(out);
}

function renderXray(out: HTMLElement, r: Card, ms: number | null, icon?:string) {
  const group = (x:Card['rows'][number]) => x.good ? (['stated','conditional'].includes(x.assessment || '') ? 'green' : 'yellow') : x.assessment==='denied' ? 'green' : x.assessment==='stated' ? 'red' : 'yellow';
  const columns = [
    {key:'red',title:'Red · Data use',description:'Data practices stated in the policy',color:'var(--d-bad)'},
    {key:'yellow',title:'Yellow · Review',description:'Conditional, unclear, or not found',color:'var(--d-unsure)'},
    {key:'green',title:'Green · Protections',description:'Stated controls or explicit limits',color:'var(--d-good)'},
  ].map(column => {
    const rows=r.rows.map((x,i)=>({x,i})).filter(({x})=>group(x)===column.key);
    return `<section class="scan-column" style="--c:${column.color}"><h4>${column.title}<span>${rows.length}</span></h4><p>${column.description}</p>${rows.map(({x,i})=>`<div class="qrow">
      <button aria-expanded="false" data-row="${i}"><span class="q">${esc(XQ[x.key])}</span><span class="scan-row-status">${esc(x.summary || 'Needs review in the source policy.')}</span><span class="scan-evidence-hint">View evidence ↓</span></button>
      <div class="evidence" hidden>${x.evidence ? `“${esc(x.evidence)}”` : 'No supporting passage returned.'}<br /><a href="${esc(r.url)}" target="_blank" rel="noopener">Read the policy</a></div>
    </div>`).join('') || '<p class="scan-empty">None in this group.</p>'}</section>`;
  }).join('');
  out.innerHTML = `
    <div class="panel-d">
      <div class="x-head">${appIcon(icon,r.name)}
        <div><h3>${esc(r.name)}</h3><p>Policy ${esc(r.updated || 'date not stated')} · <a href="${esc(r.url)}" target="_blank" rel="noopener">source</a></p></div></div>
      <p class="speed" style="margin:12px 0 0"><b>${fmt(r.rows.length)} privacy questions · ${fmt(r.clauses)} passages reviewed</b> ${ms == null ? '' : `· live in ${secs(ms)}`}</p>
    </div>
    <div class="scan-columns">${columns}</div>
    `;
  $$('[data-row]', out).forEach((b) =>
    b.addEventListener('click', () => {
      const ev = b.nextElementSibling as HTMLElement;
      ev.hidden = !ev.hidden;
      b.setAttribute('aria-expanded', String(!ev.hidden));
    }),
  );

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

function setJobStep(step:string) {
  $('#jobContext').hidden=step !== 'context';
  $('#jobReview').hidden=step !== 'review';
  $('#jobsOut').hidden=step === 'context';
  $$('[data-job-step]').forEach(el => {
    if(el.dataset.jobStep === step) el.setAttribute('aria-current','step'); else el.removeAttribute('aria-current');
  });
}
let jobPreparationUsage:RunUsage|undefined;
function countJobInputs() {
  $('#jobCharCount').textContent=`${fmt($<HTMLTextAreaElement>('#jobProfile').value.length)} / 40,000`;
  $('#jobTaskCount').textContent=`${$<HTMLTextAreaElement>('#jobTasks').value.split('\n').filter(x=>x.trim()).length} tasks`;
}
$('#jobProfile').addEventListener('input',countJobInputs);
$('#jobTasks').addEventListener('input',countJobInputs);
$('#jobBackContext').addEventListener('click',()=>setJobStep('context'));
$('#manualJob').addEventListener('click', () => {
  jobPreparationUsage=undefined;
  $('#jobTaskSource').hidden=true;
  setJobStep('review');
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
    const r = await api<{ title: string; tasks: string[]; source?:string }>('/api/tools/jobs', { action: 'extract', profile }, t.retry);
    jobPreparationUsage=r.runUsage;
    $('#jobTaskSource').hidden=r.source!=='suggested';
    $('#jobTaskSource').textContent='Your profile lists a role but no duties. These are suggested tasks for that role—edit or remove anything that does not fit.';
    $<HTMLInputElement>('#jobSearch').value = r.title;
    $<HTMLTextAreaElement>('#jobTasks').value = r.tasks.join('\n');
    setJobStep('review');
    $('#jobsOut').innerHTML = '';
    out.innerHTML = '';
    countJobInputs();
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
    if(jobPreparationUsage){const a=jobPreparationUsage,b=r.runUsage;updateReceipt({runUsage:{costUsd:a.costUsd+b.costUsd,costComplete:a.costComplete&&b.costComplete,elapsedMs:a.elapsedMs+b.elapsedMs,calls:a.calls+b.calls,inputTokens:a.inputTokens+b.inputTokens,outputTokens:a.outputTokens+b.outputTokens,stages:[...(a.stages||[]),...(b.stages||[])]}});}
    setJobStep('results');
    reveal(out);
  } catch (e) { showError(out, e); }
  finally { btn.disabled = false; }
});

function renderJobs(out: HTMLElement, r: JobRes, ms: number | null) {
  const categories=['Automate','Augment','Own'];
  const colors=['#a49aff','#70dded','#81e2b1'];
  const descriptions=['AI does it; you review','AI helps you do it','You lead'];
  out.innerHTML=`<div class="job-results-heading"><h3>${esc(r.title)}</h3><span>${r.tasks.length} tasks · ${secs(ms || r.ms)}</span></div>
  <div class="split">${categories.map((b,i)=>{const share=r.tasks.filter(t=>t.bucket===b).length/r.tasks.length;return `<span style="width:${share*100}%;background:${colors[i]}" title="${b}: ${pct(share)}">${share>=.15 ? pct(share) : ''}</span>`;}).join('')}</div>
  <div class="job-columns">${categories.map((b,i)=>{
    const tasks=r.tasks.filter(t=>t.bucket===b).sort((a,b)=>b.p-a.p);
    return `<section class="job-column" style="--c:${colors[i]}"><h4>${b} · ${tasks.length}</h4><p>${descriptions[i]}</p>${tasks.map(t=>`<div class="task">${esc(t.t)}${t.borderline ? '<span class="tag-b">Worth reviewing</span>' : ''}<div class="conf"><i style="width:${t.p*100}%;background:${colors[i]}"></i></div><small>${pct(t.p)} Jev probability</small></div>`).join('') || '<p>No tasks</p>'}</section>`;
  }).join('')}</div>
  <p class="credit">AI estimates about your tasks, not a prediction that your job will disappear.</p><div class="jr-result-actions"><button class="btn-d" id="editJobTasks">Edit tasks</button><button class="btn-d" id="copyJobResults">Copy results</button></div>`;
  $('#editJobTasks',out).addEventListener('click',()=>{setJobStep('review');out.innerHTML='';});
  $('#copyJobResults',out).addEventListener('click',()=>void copy(`${r.title}\n\n${r.tasks.map(t=>`${t.bucket}: ${t.t}`).join('\n')}`));
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
let buildLoading = false;
let buildReady = false;
async function prepareBuild() {
  if(buildLoading || buildReady) return;
  buildLoading=true;
  $('#retryBuild').hidden=true;
  $('#starterPrompt').textContent='Preparing your demo token…';
  try {
    const [r,models]=await Promise.all([
      api<{token:string}>('/api/token',{}),
      getJson<{data:{id:string}[]}>('/api/v1/models'),
    ]);
    if(!models.data?.some(m=>m.id==='typesafe/jev-1.13')) throw new Error('Could not load the demo configuration. Retry.');
    $('#starterPrompt').textContent=`Build a working app around Jev System One decisions for the task below.

Demo API token: ${r.token}
Decision endpoint: POST https://tylerw.ai/api/v1/systemone
Authorization: Bearer <demo API token>
Content-Type: application/json
Model: typesafe/jev-1.13
Request: {"model":"typesafe/jev-1.13","state":{"message":"Please send the report by 5pm today."},"questions":{"urgent":{"type":"noul","instructions":"Does this require action today?"},"route":{"type":"choice","instructions":"How should this message be handled?","criteria":{"act":"Concrete action requested","read":"Information only","review":"Unclear"}},"priority":{"type":"score","instructions":"How urgent is it?","criteria":["Low","Medium","High"]}}}
Response: answers.urgent.noul is a probability from 0 to 1; answers.route includes choice, confidence and probabilities; answers.priority includes score (zero-based), confidence and probabilities. usage.cost is actual USD. model identifies the serving release.

Use Jev for every classification, routing decision, score and verification. Batch independent questions about the same state in one request. Branch on its typed probabilities; send uncertainty to user review. Never silently replace Jev with a chat model or invent results. Jev does not generate text.

If text extraction or prose is necessary, use a separate explicitly labeled text-generation step, then let Jev decide. Optional text endpoint: POST https://tylerw.ai/api/v1/chat/completions, same demo token; GET https://tylerw.ai/api/v1/models lists text models. That endpoint takes messages and is not the decision endpoint.

Build a simple mobile-friendly input, Run, results and loading interface. Show actual Jev cost and elapsed API time separately from text-model work and total workflow time. Keep all provider calls server-side. Store this limited demo token in a gitignored environment file. It expires at midnight Eastern and allows up to 2,000 calls across endpoints. Do not change your own coding assistant provider or credentials.

Provide files and commands to run it. If you cannot call the API yourself, give runnable code and say it is untested.

Type what you want this to do:`;
    buildReady=true;
    $<HTMLButtonElement>('#copyBuild').disabled=false;
  } catch(e) {
    $('#starterPrompt').textContent=e instanceof Error ? e.message : 'Could not prepare your demo token.';
    $('#retryBuild').hidden=false;
  } finally {buildLoading=false;}
}
$('#build').addEventListener('toggle',()=>{if($<HTMLDetailsElement>('#build').open) void prepareBuild();});
$('#retryBuild').addEventListener('click',()=>void prepareBuild());
$('#copyBuild').addEventListener('click',()=>void copy($('#starterPrompt').textContent || '', 'Copied — paste into your AI'));

// — Room pulse (header stat + "recent apps") ——————————————————
interface Room {
  totals: { jevDecisions?:number; jevSpend?:number; textSpend?:number; decisions: number; people: number; spent:number };
  xray: { recent: string[] };
}
let room: Room | null = null;
let pollingRoom=false;
let nextRoomPoll=0;
let roomFailures=0;
async function pollRoom() {
  if(document.visibilityState!=='visible'||pollingRoom||Date.now()<nextRoomPoll)return;
  pollingRoom=true;
  try {
    room = await getJson<Room>('/api/wall');
    roomFailures=0;nextRoomPoll=Date.now()+15000;
    $('#roomStat').textContent = `${fmt(room.totals.decisions)} total decisions · ${fmt(room.totals.jevDecisions||0)} Jev · ${fmt(room.totals.people)} people · $${room.totals.spent.toFixed(4)} USD spent`;
  } catch {
    roomFailures++;nextRoomPoll=Date.now()+Math.min(60000,15000*2**Math.min(roomFailures,2));
  } finally {pollingRoom=false;}
}
async function pollPersonal() {
  try {
    const res=await fetch('/api/usage',{headers:{'x-device-id':deviceId()}});
    if (!res.ok) return;
    const u=await res.json();
    $('#personalStat').textContent=`${fmt(u.decisions)} total decisions · ${fmt(u.jevDecisions||0)} Jev · ${fmt(u.runs)} tool calls · $${u.costUsd.toFixed(6)} USD${u.costComplete ? '' : ' (reported portion)'} · ${secs(u.elapsedMs)} processing`;
  } catch {}
}
void pollPersonal();
void pollRoom();
setInterval(()=>void pollRoom(),15_000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){nextRoomPoll=0;void pollRoom();void pollPersonal();}});

// Open deep links only after all tool openers and state are initialized.
if (pageTool) openers[pageTool]?.();
