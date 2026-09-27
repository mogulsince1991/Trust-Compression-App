const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const storage = new Map();
let imports = 0;
function load() {
  const exported = {};
  const db = { from() { const q = { select: () => q, eq: () => q, order: () => q, range: async () => ({ data: [{ id: 'folder' }] }) }; return q; }, auth: { getSession: async () => ({ data: { session: { user: { id: 'user' }, access_token: 'test' } } }) } };
  const source = fs.readFileSync('components/library-source-refresh.tsx', 'utf8') + '\nexport { refreshCollections };';
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports: exported, Date, Map, Set, Promise, AbortSignal,
    sessionStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) },
    fetch: async () => { imports++; return { ok: true, json: async () => ({}) }; },
    require: name => name === '@/lib/supabase' ? { createBrowserSupabaseClient: () => db } : name === '@/lib/source-refresh' ? { uniqueCollections: rows => rows } : {}
  });
  return exported.refreshCollections;
}
(async () => {
  const refresh = load();
  const first = refresh('user:one', 'one');
  assert.equal(refresh('user:one', 'one'), first);
  await first.done;
  assert.equal(imports, 1);
  await refresh('user:one', 'one').done;
  assert.equal(imports, 1, 'Remount must not repeat completed refresh');
  await load()('user:one', 'one').done;
  assert.equal(imports, 1, 'Page reload must respect session cooldown');
  await refresh('user:two', 'two').done;
  assert.equal(imports, 2, 'Workspaces refresh independently');
  console.log('Library refresh: in-flight sharing, remount cooldown, reload cooldown and workspace isolation passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
