const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file); if (!fs.existsSync(file)) file += '.ts';
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    { exports, Date, Intl, console, require: name => name.startsWith('@/') ? load(name.slice(2)) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name) });
  return exports;
}
const { parseSpendCsv, validateSpendRows, monthBounds } = load('lib/metrics/contractor/spend-input.ts');
assert.equal(monthBounds('2028-02').end, '2028-02-29');
assert.throws(() => monthBounds('2026-13'), /valid month/);
const rows = parseSpendCsv('Date,Vendor,Spend,Document URL\n2026-05-01,"Vendor, Inc.","$1,234.50",https://example.com/invoice\n', '2026-05');
assert.equal(rows[0].spend, 1234.5); assert.equal(rows[0].vendor, 'Vendor, Inc.');
for (const row of [{ date: '2026-06-01', vendor: 'Meta', spend: '10' }, { date: '2026-05-01', vendor: 'Meta', spend: 'bad' }, { date: '2026-05-01', vendor: 'Meta', spend: '10', sourceFile: 'javascript:alert(1)' }]) assert.throws(() => validateSpendRows([row], '2026-05'));
assert.throws(() => parseSpendCsv('Date,Vendor\n2026-05-01,Meta', '2026-05'), /spend column/);
const { orderMetrics } = load('lib/metrics/contractor/metric-validation.ts');
const count = { id: 'count', name: 'Count', operation: 'count' }, formula = { id: 'formula', name: 'Formula', operation: 'formula', formula: 'count / 2' };
assert.equal(orderMetrics([formula, count])[0].id, 'count');
assert.throws(() => orderMetrics([{ ...formula, formula: 'missing / 2' }, count]), /unknown metric/);
assert.throws(() => orderMetrics([{ ...formula, formula: 'formula / 2' }]), /circular/);
assert.throws(() => orderMetrics([{ ...formula, formula: 'count /' }, count]), /incomplete/);
const { createDefaultContractorRuleSet } = load('lib/metrics/contractor/config.ts');
const { saveContractorRuleSet } = load('lib/server/contractor-rule-sets.ts');
const draft = createDefaultContractorRuleSet();
draft.isDefault = false;
draft.metricDefinitions.push({ ...formula, id: 'custom', formula: 'overall_spend / 2', displayType: 'currency', object: 'marketing_spend_rows', provider: 'spend' });
let saved;
const db = { from() { return { update(value) { saved = value; return this; }, eq() { return this; }, select() { return this; }, async single() { return { data: { ...saved, id: 'rule' } }; } }; } };
saveContractorRuleSet(db, 'workspace', draft, 'user', 'rule').then(result => {
  assert.ok(result.metricDefinitions.some(metric => metric.id === 'custom'));
  assert.equal(result.isDefault, false);
  const source = fs.readFileSync('components/trust-app-ingestion.tsx','utf8');
  assert.ok(source.includes('hidden={view !== "reports"}'));
  assert.ok(source.includes('[isInternal, session?.user.id, supabase]'));
  console.log('Spend dates/CSV/URLs, formula validation/order, config persistence and navigation guards passed.');
}).catch(error => { console.error(error); process.exitCode = 1; });
