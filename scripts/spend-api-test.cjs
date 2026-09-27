const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const input = { exports: {} }; vm.runInNewContext(compile('lib/metrics/contractor/spend-input.ts'), input);
const ledger = [{ id: 'one', workspace_id: 'a', spend_date: '2026-05-01', vendor: 'Meta', spend: 20 }, { id: 'other', workspace_id: 'b', spend_date: '2026-05-01', spend: 500 }];
const db = { from() {
  let filters = [], operation, update;
  const query = { eq(key, value) { filters.push(row => row[key] === value); return this; },
    gte(key, value) { filters.push(row => row[key] >= value); return this; }, lte(key, value) { filters.push(row => row[key] <= value); return this; },
    order() { return this; }, range() { return this; }, select() { return this; },
    delete() { operation = 'delete'; return this; }, update(value) { operation = 'update'; update = value; return this; },
    then(resolve) { const rows = ledger.filter(row => filters.every(test => test(row))); if (operation === 'delete') rows.forEach(row => ledger.splice(ledger.indexOf(row), 1)); if (operation === 'update') rows.forEach(row => Object.assign(row, update)); return Promise.resolve({ data: rows.map(row => ({ ...row })) }).then(resolve); },
  }; return query;
} };
const context = { exports: {}, URL, require(name) {
  if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
  if (name.endsWith('spend-input')) return input.exports;
  if (name.endsWith('route-auth')) return {
    async requireWorkspaceAccess(request, workspace) { if (!request.role) throw Object.assign(new Error('Sign in'), { status: 401 }); if (workspace !== 'a') throw Object.assign(new Error('Forbidden'), { status: 403 }); return { workspaceRole: request.role, userSupabase: db }; },
    requireWorkspaceManager(ctx) { if (ctx.workspaceRole !== 'owner') throw Object.assign(new Error('Owner required'), { status: 403 }); return ctx; },
  };
  return require(name);
} };
vm.runInNewContext(compile('app/api/metrics/contractor/spend/route.ts'), context);
const api = context.exports;
const request = (body, role = 'owner') => ({ role, json: async () => body });
(async () => {
  assert.equal((await api.DELETE(request({ workspaceId: 'a', id: 'one' }, 'member'))).status, 403);
  assert.equal((await api.DELETE(request({ workspaceId: 'a', id: 'other' }))).status, 404);
  assert.equal(ledger.length, 2);
  assert.equal((await api.PATCH(request({ workspaceId: 'a', id: 'one', row: { date: '2026-05-02', vendor: 'Google', spend: 30 } }))).status, 200);
  assert.equal(ledger[0].spend, 30); assert.equal(ledger[1].spend, 500);
  assert.equal((await api.PATCH(request({ workspaceId: 'a', id: 'one', row: { date: '2026-05-40', vendor: 'Bad', spend: 1 } }))).status, 400);
  const all = await api.GET({ role: 'owner', url: 'https://example.com?workspaceId=a&month=all' });
  assert.equal(all.body.rows.length, 1);
  assert.equal((await api.DELETE(request({ workspaceId: 'a', id: 'one' }))).status, 200);
  assert.equal(ledger.length, 1); assert.equal(ledger[0].workspace_id, 'b');
  console.log('Spend edit/delete permissions, cross-workspace isolation, invalid dates, all-month listing and missing rows passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
