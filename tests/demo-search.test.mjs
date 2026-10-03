import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'demo-search-'));
await build({ entryPoints: ['functions/api/_policy.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'policy.mjs') });
const { searchApps } = await import(pathToFileURL(join(dir, 'policy.mjs')));
const result = { results: [{ trackId: 12345678, trackName: 'Example', sellerName: 'Publisher', primaryGenreName: 'Tools' }] };
const originalFetch = globalThis.fetch;
test('plain Apple request validates and maps search results', async () => {
  globalThis.fetch = async (url, init) => {
    assert.match(url, /term=a%26b/);
    assert.equal(init.cf, undefined);
    assert.equal(init.headers['user-agent'], undefined);
    return Response.json(result);
  };
  try { assert.deepEqual(await searchApps('a&b'), [{ id: '12345678', name: 'Example', seller: 'Publisher', genre: 'Tools' }]); }
  finally { globalThis.fetch = originalFetch; }
});
test('Apple denial falls back to reader and extracts JSON', async () => {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    if (++calls === 1) return new Response('denied', { status: 403 });
    assert.match(url, /^https:\/\/r.jina.ai\/https:\/\/itunes.apple.com/);
    assert.equal(init.headers.authorization, undefined);
    return new Response(`Title: Search\n\nMarkdown Content:\n\n${JSON.stringify(result)}`);
  };
  try { assert.equal((await searchApps('Example'))[0].name, 'Example'); assert.equal(calls, 2); }
  finally { globalThis.fetch = originalFetch; }
});
test('invalid upstream responses produce a recoverable error', async () => {
  globalThis.fetch = async () => new Response('<html>Unavailable</html>');
  try { await assert.rejects(searchApps('Example'), e => e.status === 503); }
  finally { globalThis.fetch = originalFetch; }
});
test('valid empty search does not invoke fallback', async () => {
  let calls = 0;
  globalThis.fetch = async () => { ++calls; return Response.json({ results: [] }); };
  try { assert.deepEqual(await searchApps('nothing'), []); assert.equal(calls, 1); }
  finally { globalThis.fetch = originalFetch; }
});
await build({ entryPoints: ['worker/secrets.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'secrets.mjs') });
const { resolveSecrets } = await import(pathToFileURL(join(dir, 'secrets.mjs')));
test('account secrets resolve per route without mutating env', async () => {
  let ai = 0, admin = 0;
  const env = { OPENROUTER_SECRET: { get: async () => { ++ai; return 'test-ai-value'; } }, DEMO_ADMIN_SECRET: { get: async () => { ++admin; return 'test-admin-value'; } } };
  const resolved = await resolveSecrets(env, 'POST', '/api/tools/scam');
  assert.equal(resolved.OPENROUTER_API_KEY, 'test-ai-value');
  assert.equal(env.OPENROUTER_API_KEY, undefined);
  assert.equal(admin, 0);
  assert.equal((await resolveSecrets(env, 'POST', '/api/wall/')).DEMO_ADMIN_KEY, 'test-admin-value');
  await resolveSecrets(env, 'GET', '/api/wall');
  assert.equal(ai, 1); assert.equal(admin, 1);
});
test('direct Worker secrets work without accessing account store', async () => {
  const env = { OPENROUTER_API_KEY: 'local-test', OPENROUTER_SECRET: { get: async () => { throw Error('should not read'); } } };
  assert.equal((await resolveSecrets(env, 'POST', '/api/tools/scam')).OPENROUTER_API_KEY, 'local-test');
});
const { parseStoreSearch } = await import(pathToFileURL(join(dir, 'policy.mjs')));
test('rendered store fallback uses labeled app links and removes duplicates', () => {
 const html = '<a aria-label="A &amp; B" href="https://apps.apple.com/us/app/a/id12345678">App</a><a href="https://apps.apple.com/us/app/a/id12345678" aria-label="Duplicate">App</a><a aria-label="Other" href="https://example.com/id87654321">Other</a>';
 assert.deepEqual(parseStoreSearch(html), [{id:'12345678',name:'A & B',seller:'',genre:''}]);
});
const {policyUrlFor,parsePolicyLink}=await import(pathToFileURL(join(dir,'policy.mjs')));
test('app page failures fall back to reader without forwarding its key to Apple',async()=>{
 let calls=0;
 globalThis.fetch=async(url,init)=>{
  calls++;
  if(calls===1){assert.equal(init.headers.authorization,undefined);return new Response('Unavailable',{status:503});}
  assert.equal(init.headers.authorization,'Bearer reader-test');
  return new Response("Title: Example – App Store\n\nMarkdown Content:\n[Developer’s Privacy Policy](https://example.com/privacy)");
 };
 try {assert.deepEqual(await policyUrlFor('12345678','reader-test'),{name:'Example',url:'https://example.com/privacy'});assert.equal(calls,2);}
 finally{globalThis.fetch=originalFetch;}
});
test('store outage is retryable rather than reporting that the app does not exist',async()=>{
 globalThis.fetch=async()=>new Response('Unavailable',{status:503});
 try{await assert.rejects(policyUrlFor('12345678'),e=>e.status===503);}finally{globalThis.fetch=originalFetch;}
});
test('privacy parser retains developer link and ignores Apple footer privacy',()=>{
 assert.equal(parsePolicyLink('[Privacy Policy](https://www.apple.com/legal/privacy/)'),null);
 assert.equal(parsePolicyLink('<a href="https://example.com/privacy?a=1&amp;b=2" aria-label="Developer\'s Privacy Policy">policy</a>').url,'https://example.com/privacy?a=1&b=2');
});

const {policyMetadata}=await import(pathToFileURL(join(dir,'policy.mjs')));
test('verified policy URL is reused during store outages without caching policy content',async()=>{
 let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('<meta property="og:title" content="Example App"><a aria-label="Developer’s Privacy Policy" href="https://example.com/privacy">Policy</a>');};
 try{
  const first=await policyMetadata({},'metadata-test-1',()=>{});assert.equal(calls,1);
  globalThis.fetch=async()=>{calls++;throw Error('Apple unavailable');};
  assert.deepEqual(await policyMetadata({},'metadata-test-1',()=>{}),first);assert.equal(calls,1);
  assert.deepEqual(Object.keys(first).sort(),['name','url']);
 }finally{globalThis.fetch=originalFetch;}
});
test('first-time lookup gets one bounded recovery attempt after transient upstream failures',async()=>{
 let calls=0;
 globalThis.fetch=async()=>++calls<3?new Response('Unavailable',{status:503}):new Response('<a aria-label="Developer’s Privacy Policy" href="https://example.com/privacy">Policy</a>');
 try{assert.equal((await policyUrlFor('12345678')).url,'https://example.com/privacy');assert.equal(calls,3);}finally{globalThis.fetch=originalFetch;}
});
