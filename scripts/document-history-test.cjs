const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const records = new Map();
const database = { from() {
  let scope, key;
  return {
    select() { return this; }, match(value) { scope = value; return this; },
    eq(_, value) { key = value; return this; },
    async maybeSingle() { return { data: records.get(JSON.stringify({ ...scope, cache_key: key })) ?? null }; },
    async upsert(row) { const { payload, updated_at, ...identity } = row; records.set(JSON.stringify(identity), { payload, updated_at }); return {}; },
  };
} };
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/integrations/contractor/document-history.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsObject, Date, require(name) {
  if (name.endsWith('salesDocuments.js')) return { SALES_RULE: { version: 'document-sales-v1' }, isSalesDocument: doc => doc.type === 'customerOrder' };
  if (name.endsWith('supabase')) return { createServiceSupabaseClient: () => database };
  throw new Error(name);
} });
const { readAllPages, documentCache, discoverSalesDocuments } = exportsObject;
(async () => {
  const rows = await readAllPages(async params => params.page ? { nodes: [2] } : { nodes: [1], nextPage: 'p2' }, x => x, x => x);
  assert.equal(JSON.stringify(rows), '[1,2]');
  await assert.rejects(() => readAllPages(async () => ({ nodes: [1], nextPage: 'stuck' }), x => x, x => x), /did not advance/);
  await assert.rejects(() => readAllPages(async () => ({}), x => x, x => x), /incomplete/);
  const a = { workspace_id: 'a', id: 'connector' }, b = { workspace_id: 'b', id: 'connector' };
  await documentCache(a).put('snapshot:May', { total: 123 });
  assert.equal((await documentCache(a).get('snapshot:May', 1000)).total, 123);
  assert.equal(await documentCache(b).get('snapshot:May', 1000), null);
  assert.equal(await documentCache({ ...a, id: 'other' }).get('snapshot:May', 1000), null);
  assert.ok(Array.from(records.keys()).every(key => key.includes('document-sales-v1')));
  let historyQueries = 0;
  const query = async q => {
    if (q.organization) return { organization: { documents: { nodes: [{ id: 'd', type: 'customerOrder', status: 'denied', priceWithTax: 10, job: { id: 'old-job' } }] } } };
    historyQueries++;
    return { document: { events: { nodes: [{ type: 'documentUpdated', createdAt: '2026-05-02T12:00:00Z', data: { next: { status: 'approved' }, previous: { status: 'draft' } } }] } } };
  };
  assert.equal((await discoverSalesDocuments(query, 'org', a))[0].historicallyApprovedAt, '2026-05-02T12:00:00Z');
  await discoverSalesDocuments(query, 'org', a);
  assert.equal(historyQueries, 1, 'Unchanged audited documents reuse durable history');
  await discoverSalesDocuments(query, 'org', b);
  assert.equal(historyQueries, 2, 'History cannot leak across workspaces');
  console.log('Document pagination, incomplete scans, approval history, cache reuse, rule version and tenant isolation passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
