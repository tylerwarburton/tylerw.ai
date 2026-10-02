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
