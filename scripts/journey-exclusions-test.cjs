const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let excluded = null, provider = 'youtube', publicJourney = true;
const inserted = [];
const service = { from(table) {
  const query = { select() { return this; }, eq() { return this; }, limit() { return this; },
    async maybeSingle() { return { data: table === 'journeys' ? { workspace_id: 'w', is_public: publicJourney } : { video_id: 'video', asset_type: 'video', embed_url: provider === 'youtube' ? 'https://www.youtube.com/embed/id' : 'https://drive.google.com/file/d/file/preview' } }; },
    async insert(value) { inserted.push(value); return {}; }
  }; return query;
} };
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync('app/api/journey-events/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(code, { exports: exportsObject, URL, console, require(name) {
  if (name === 'next/server') return { NextResponse: { json: (data, init) => Response.json(data, init) } };
  if (name.includes('analytics-exclusion')) return { analyticsExclusion: async () => excluded };
  return { createServiceSupabaseClient: () => service };
} });
function post(overrides) { return exportsObject.POST(new Request('https://test.example/api/journey-events', { method: 'POST', body: JSON.stringify({ journeyId: 'journey', assetId: 'asset', videoId: 'video', eventType: 'asset_progress', metadata: { measurement: 'observed_playback', secondsWatched: 10 }, ...overrides }) })); }
(async () => {
  assert.equal((await post()).status, 200);
  assert.equal(inserted.at(-1).metadata.excluded, false);
  excluded = 'workspace_member';
  await post({ metadata: { excluded: false } });
  assert.equal(inserted.at(-1).metadata.excluded, true);
  assert.equal(inserted.at(-1).metadata.exclusionReason, 'workspace_member');
  excluded = null; provider = 'drive';
  const count = inserted.length;
  assert.equal((await post()).status, 400);
  assert.equal(inserted.length, count);
  assert.equal((await post({ eventType: 'opened', assetId: null, videoId: null })).status, 200);
  assert.equal((await post({ eventType: 'invented' })).status, 400);
  provider = 'youtube';
  assert.equal((await post({ videoId: 'wrong-video' })).status, 400);
  publicJourney = false;
  assert.equal((await post()).status, 404);
  console.log('Journey exclusions, metadata override prevention, private journeys, asset association and Drive measurement rejection passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
