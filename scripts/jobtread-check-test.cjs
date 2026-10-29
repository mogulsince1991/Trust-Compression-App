const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const exported = {};
let role = 'owner', status = 200, calls = 0;
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/connect/jobtread/check/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  exports: exported, AbortSignal, Date,
  require(name) {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
    if (name.endsWith('route-auth')) return { requireWorkspaceAccess: async () => ({ workspaceRole: role }), requireWorkspaceManager: context => { if (context.workspaceRole !== 'owner') throw { status: 403 }; return context; } };
    return { getConnectedAccountForWorkspace: async (_, scope) => { assert.equal(scope.provider, 'jobtread'); assert.equal(scope.workspaceId, 'workspace'); return { access_token: 'test-only', metadata: { organizationId: 'org' } }; } };
  },
  fetch: async (url, init) => { calls++; assert.equal(url, 'https://api.jobtread.com/pave'); assert.equal(JSON.parse(init.body).query.$.grantKey, 'test-only'); return { ok: status === 200, status, body: { cancel: async () => {} }, json: async () => ({ currentGrant: { user: { memberships: { nodes: [{ organization: { id: 'org' } }] } } } }) }; },
});
(async () => {
  const request = { json: async () => ({ workspaceId: 'workspace', connectedAccountId: 'account' }) };
  assert.equal((await exported.POST(request)).status, 200);
  role = 'viewer'; assert.equal((await exported.POST(request)).status, 403); assert.equal(calls, 1);
  role = 'owner'; status = 401;
  const rejected = await exported.POST(request);
  assert.equal(rejected.status, 502); assert.match(rejected.body.error, /rejected/);
  assert.ok(!JSON.stringify(rejected).includes('test-only'));
  console.log('Connection check: authorized access, fixed destination, credential rejection and safe output passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
