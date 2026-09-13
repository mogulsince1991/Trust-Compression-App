const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const writes = [];
const database = {
  auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) },
  from(table) {
    return { insert(values) {
      writes.push({ table, values });
      return { select: () => ({ single: async () => ({ data: { id: 'test-journey', share_token: 'test-token' } }) }), then: resolve => resolve({ error: null }) };
    } };
  }
};
const filename = path.resolve('app/api/journeys/route.ts');
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod.require = id => {
  if (id === '@/lib/supabase') return { createUserSupabaseClient: () => database, createServiceSupabaseClient: () => null };
  if (id === '@/lib/journey-embeds') return { normalizeJourneyEmbed: ({ url, title }) => ({ sourceUrl: url, embedUrl: url, title, assetType: 'pdf', sourcePlatform: 'manual', metadata: {} }) };
  if (id === '@/lib/server/activity') return { recordActivity: async () => {} };
  return require(id);
};
mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
async function run() {
  for (const publish of [false, true, undefined]) {
    writes.length = 0;
    const body = { workspaceId: 'test-workspace', title: 'Test draft', assets: [{ title: 'Guide', sourceUrl: 'https://example.test/guide.pdf' }], ...(publish === undefined ? {} : { publish }) };
    const response = await mod.exports.POST(new Request('http://localhost/api/journeys', { method: 'POST', headers: { authorization: 'Bearer test-only', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    assert.equal(response.status, 200);
    const journey = writes.find(w => w.table === 'journeys').values;
    assert.equal(journey.is_public, publish !== false);
    assert.equal(journey.published_at === null, publish === false);
    assert.equal(journey.workspace_id, 'test-workspace');
    assert.equal(writes.find(w => w.table === 'journey_assets').values.length, 1);
  }
  writes.length = 0;
  const denied = await mod.exports.POST(new Request('http://localhost/api/journeys', { method: 'POST' }));
  assert.equal(denied.status, 401);
  assert.equal(writes.length, 0);
  console.log('PASS: private draft, explicit publish, legacy default, asset insert, workspace scope, missing authentication. Database mocked; no live writes.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
