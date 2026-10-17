const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const exportsObject = {};
let fetchMock;
const code = ts.transpileModule(fs.readFileSync('lib/server/google-photos.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports: exportsObject, require, Buffer, URL, Date, AbortSignal, fetch: (...args) => fetchMock(...args) });
const { photoAssetId, photoDownloadUrl, signPhoto, verifyPhoto, downloadPhoto, pickerRequest } = exportsObject;
const photo = { id: 'photo-1', type: 'PHOTO', mediaFile: { baseUrl: 'https://lh3.googleusercontent.com/picked-photo', filename: 'Kitchen.jpg', mimeType: 'image/jpeg' } };
const ticket = signPhoto(photo, 'workspace-a', 'user-a', 'secret');
assert.equal(verifyPhoto(ticket, 'workspace-a', 'user-a', 'secret').id, photo.id);
assert.throws(() => verifyPhoto(ticket, 'workspace-b', 'user-a', 'secret'));
assert.throws(() => verifyPhoto(ticket, 'workspace-a', 'user-b', 'secret'));
assert.throws(() => verifyPhoto(ticket, 'workspace-a', 'user-a', 'other-secret'));
assert.throws(() => verifyPhoto(ticket + 'x', 'workspace-a', 'user-a', 'secret'));
const now = Date.now;
Date.now = () => now() + 60 * 60 * 1000;
assert.throws(() => verifyPhoto(ticket, 'workspace-a', 'user-a', 'secret'));
Date.now = now;
assert.equal(photoAssetId('a','1'), photoAssetId('a','1'));
assert.notEqual(photoAssetId('a','1'), photoAssetId('b','1'));
assert.match(photoAssetId('a','1'), /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
for (const url of ['http://lh3.googleusercontent.com/p', 'https://googleusercontent.com.evil.test/p', 'https://localhost/p', 'https://127.0.0.1/p', 'https://user@lh3.googleusercontent.com/p', 'https://lh3.googleusercontent.com:444/p']) assert.throws(() => photoDownloadUrl(url));
assert.equal(photoDownloadUrl(photo.mediaFile.baseUrl), photo.mediaFile.baseUrl + '=w2048-h2048');
assert.throws(() => verifyPhoto(signPhoto({ ...photo, type: 'VIDEO' }, 'a', 'b', 's'), 'a', 'b', 's'));
(async () => {
  fetchMock = async (url, options) => {
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer token');
    return new Response(Uint8Array.from([255,216,255,224]), { headers: { 'content-type': 'image/jpeg' } });
  };
  assert.equal((await downloadPhoto(photo, 'token')).bytes.length, 4);
  fetchMock = async () => new Response('<html>not an image</html>', { headers: { 'content-type': 'image/jpeg' } });
  await assert.rejects(downloadPhoto(photo, 'token'), /invalid image/);
  fetchMock = async () => new Response('svg', { headers: { 'content-type': 'image/svg+xml' } });
  await assert.rejects(downloadPhoto(photo, 'token'), /not supported/);
  fetchMock = async () => new Response(new Uint8Array(10 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/jpeg' } });
  await assert.rejects(downloadPhoto(photo, 'token'), /10 MB/);
  fetchMock = async () => new Response('', { status: 401 });
  await assert.rejects(pickerRequest('token', 'sessions'), /expired/);
  const route = {};
  let role = 'viewer';
  let authenticated = true;
  const httpError = (status, message) => Object.assign(new Error(message), { status });
  const routeCode = ts.transpileModule(fs.readFileSync('app/api/import/google-photos/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(routeCode, {
    exports: route, process: { env: { GOOGLE_PHOTOS_CLIENT_ID: 'client-id', SUPABASE_SERVICE_ROLE_KEY: 'secret' } }, URL, Date,
    require: name => name === 'next/server' ? { NextResponse: { json: (body, options) => ({ body, ...options }) } } : name === '@/lib/server/google-photos' ? exportsObject : name === '@/lib/server/route-auth' ? {
      httpError,
      requireWorkspaceAccess: async () => { if (!authenticated) throw httpError(401, 'Sign in'); return { workspaceRole: role, user: { id: 'user-a' }, serviceSupabase: {} }; },
      requireWorkspaceManager: context => { if (!['owner','admin'].includes(context.workspaceRole)) throw httpError(403, 'Read only'); return context; },
    } : require(name),
  });
  const request = body => ({ url: 'https://app.trusttale.co/api/import/google-photos?workspaceId=workspace-a', text: async () => JSON.stringify(body), json: async () => body });
  assert.equal((await route.GET(request())).status, 403);
  assert.equal((await route.POST(request({ workspaceId: 'workspace-a', action: 'create', googleToken: 'token' }))).status, 403);
  authenticated = false;
  assert.equal((await route.GET(request())).status, 401);
  authenticated = true; role = 'owner';
  assert.equal((await route.GET(request())).body.clientId, 'client-id');
  assert.equal((await route.POST(request({ workspaceId: 'workspace-a', action: 'import', googleToken: 'token', ticket, consent: false }))).status, 400);
  assert.equal((await route.POST(request({ workspaceId: 'workspace-b', action: 'import', googleToken: 'token', ticket, consent: true }))).status, 400);
  assert.equal((await route.POST(request({ workspaceId: 'workspace-a', action: 'create' }))).status, 400);
  console.log('Google Photos: scoped tickets, expiry, dedup IDs, SSRF restrictions, video exclusion, byte limits and image validation passed.');
  console.log('Import routes: unauthenticated/read-only users, missing consent/token and cross-workspace tickets rejected.');
})().catch(error => { console.error(error); process.exitCode = 1; });
