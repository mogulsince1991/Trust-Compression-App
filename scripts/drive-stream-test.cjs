const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
let upstreamRange;
let status = 206;
let calls = 0;
const code = ts.transpileModule(fs.readFileSync('app/api/media/drive/[id]/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
vm.runInNewContext(code, { exports: exportsObject, URL, Headers, Response, process: { env: { GOOGLE_DRIVE_API_KEY: 'test' } }, require: () => ({ NextResponse: { json: (data, init) => Response.json(data, init) } }), fetch: async (_, options) => {
  calls++; upstreamRange = options.headers.range;
  return new Response('bytes', { status, headers: { 'content-range': 'bytes 0-4/100', 'content-type': 'video/mp4' } });
} });
async function run(range) { return exportsObject.GET(new Request('https://app.example/video', { headers: range ? { range } : {} }), { params: { id: 'abcdefghij123' } }); }
(async () => {
  assert.equal((await run('bytes=0-1')).status, 206);
  assert.equal(upstreamRange, 'bytes=0-1');
  await run('bytes=0-'); assert.equal(upstreamRange, 'bytes=0-2097151');
  await run('bytes=4000000-'); assert.equal(upstreamRange, 'bytes=4000000-6097151');
  await run('bytes=-100'); assert.equal(upstreamRange, 'bytes=-100');
  const before = calls;
  assert.equal((await run('bytes=4-2')).status, 416);
  assert.equal((await run('bytes=0-2,4-6')).status, 416);
  assert.equal(calls, before);
  status = 200;
  assert.equal((await run('bytes=0-')).status, 502);
  console.log('Drive bounded ranges, Safari two-byte probe, seeks, suffixes, malformed requests and full-response rejection passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
