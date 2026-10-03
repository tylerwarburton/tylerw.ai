// Room wall: polls /api/wall once a second and animates what changed.
// Presenter keys (needs ?key= on first load): F freeze/unfreeze, R reset.

interface Wall {
  totals: { jevDecisions?:number; decisions: number; people: number; spent: number; runs: number };
  scam: { total: number; unsure: number; kinds: { kind: string; n: number }[] };
  xray: { apps: { id: string; name: string; n: number; risks: number; riskTotal: number }[]; worst: { name: string; risks: number; riskTotal: number } | null };
  jobs: { runs: number; avgSplit: Record<string, number> | null; mostExposed: { title: string; exposure: number } | null; borderline: string[] };
  frozen: boolean;
}

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

const params = new URLSearchParams(location.search);
if (params.get('key')) {
  sessionStorage.setItem('wall-key', params.get('key')!);
  history.replaceState(null, '', location.pathname);
}
const adminKey = sessionStorage.getItem('wall-key') ?? '';

let prev: Wall | null = null;
const prevCounts = new Map<string, number>();

function bars(el: HTMLElement, rows: { id: string; label: string; n: number; color?: string }[], max: number) {
  const keep = new Set(rows.map((r) => r.id));
  for (const child of Array.from(el.children) as HTMLElement[]) if (!keep.has(child.dataset.id!)) child.remove();
  rows.forEach((r, i) => {
    let row = el.querySelector<HTMLElement>(`[data-id="${CSS.escape(r.id)}"]`);
    if (!row) {
      row = document.createElement('div');
      row.className = 'bar';
      row.dataset.id = r.id;
      row.innerHTML = '<span class="l"></span><span class="t"><i style="width:0"></i></span><span class="n mono"></span>';
    }
    if (el.children[i] !== row) el.insertBefore(row, el.children[i] ?? null);
    row.querySelector('.l')!.textContent = r.label;
    row.querySelector('.n')!.textContent = String(r.n);
    const bar = row.querySelector<HTMLElement>('.t i')!;
    if (r.color) bar.style.setProperty('--c', r.color);
    requestAnimationFrame(() => (bar.style.width = `${(r.n / Math.max(max, 1)) * 100}%`));
    const key = `${el.id}:${r.id}`;
    if (prevCounts.has(key) && prevCounts.get(key)! < r.n) {
      row.classList.remove('pulse');
      void row.offsetWidth;
      row.classList.add('pulse');
    }
    prevCounts.set(key, r.n);
  });
}

function render(w: Wall) {
  $('tDecisions').textContent = fmt(w.totals.decisions);
  $('tJev').textContent=fmt(w.totals.jevDecisions||0);
  $('tPeople').textContent = fmt(w.totals.people);
  $('tSpent').textContent = `$${w.totals.spent.toFixed(2)}`;

  // Scam
  $('scamCount').textContent = w.scam.total ? `${w.scam.total} checked` : '';
  const kinds = w.scam.kinds.slice(0, 7);
  bars(
    $('scamBars'),
    kinds.map((k) => ({ id: k.kind, label: k.kind, n: k.n, color: k.kind === 'legitimate' ? 'var(--good)' : 'var(--bad)' })),
    kinds[0]?.n ?? 1,
  );
  if (!w.scam.total) $('scamBars').innerHTML = '<p class="w-empty">Paste a scam text from your phone.</p>';
  $('scamUnsure').textContent = w.scam.total ? `${Math.round((w.scam.unsure / w.scam.total) * 100)}% judged "Not sure"` : '';

  // X-ray
  $('xrayCount').textContent = w.xray.apps.length ? `${w.xray.apps.reduce((a, x) => a + x.n, 0)} runs` : '';
  $('xrayWorst').innerHTML = w.xray.worst
    ? `<small>Worst in the room</small>${esc(w.xray.worst.name)}: ${w.xray.worst.risks} of ${w.xray.worst.riskTotal} risk signals`
    : '';
  bars(
    $('xrayApps'),
    w.xray.apps.slice(0, 6).map((a) => ({ id: a.id, label: a.name, n: a.n })),
    w.xray.apps[0]?.n ?? 1,
  );
  if (!w.xray.apps.length) $('xrayApps').innerHTML = '<p class="w-empty">Pick an app you use every day.</p>';

  // Jobs
  $('jobsCount').textContent = w.jobs.runs ? `${w.jobs.runs} jobs` : '';
  const s = w.jobs.avgSplit;
  $('jobsSplit').innerHTML = s
    ? (
        [
          ['Automate', 'var(--bad)'],
          ['Augment', 'var(--unsure)'],
          ['Own', 'var(--good)'],
        ] as const
      )
        .map(([k, c]) => `<span style="width:${(s[k] * 100).toFixed(1)}%;background:${c}">${s[k] > 0.12 ? `${k} ${Math.round(s[k] * 100)}%` : ''}</span>`)
        .join('')
    : '';
  $('jobsExposed').innerHTML = w.jobs.mostExposed
    ? `<small>Most exposed job in the room</small>${esc(w.jobs.mostExposed.title)} · ${w.jobs.mostExposed.exposure.toFixed(1)} / 5`
    : '';
  $('jobsBorder').innerHTML = w.jobs.borderline.length
    ? w.jobs.borderline.map((t) => `<li>${esc(t)}</li>`).join('')
    : '<li class="w-empty" style="list-style:none">Try your own job title.</li>';

  const st = $('wStatus');
  st.textContent = w.frozen ? 'FROZEN · press F to resume' : adminKey ? 'live · F freeze · R reset' : 'live';
  st.classList.toggle('frozen', w.frozen);
  prev = w;
}

let polling=false;
let nextPoll=0;
let failures=0;
async function poll() {
  if(document.visibilityState!=='visible'||polling||Date.now()<nextPoll)return;
  polling=true;
  try {
    const res=await fetch('/api/wall',{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!res.ok)throw new Error('Room totals temporarily unavailable');
    render((await res.json()) as Wall);
    failures=0;nextPoll=Date.now()+5000;
  } catch {
    failures++;nextPoll=Date.now()+Math.min(60000,10000*2**Math.min(failures-1,3));
    $('wStatus').textContent='Room totals unavailable · retrying automatically';
  } finally {polling=false;}
}

async function presenter(action: string) {
  if (!adminKey) return;
  await fetch('/api/wall', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, key: adminKey }),
  });
  prevCounts.clear();
  nextPoll=0;await poll();
}

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'f' || e.key === 'F') void presenter(prev?.frozen ? 'unfreeze' : 'freeze');
  if ((e.key === 'r' || e.key === 'R') && confirm('Reset the room wall? This clears all results.')) void presenter('reset');
});

void poll();
setInterval(poll, 5000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){nextPoll=0;void poll();}});
