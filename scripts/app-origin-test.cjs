const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/app-origin.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: api, URL });
for (const origin of ['https://trusttale.co','https://trustcompression.unmarked.media']) {
  assert.equal(api.localAppUrl('https://app.trusttale.co/share/a?x=1#v', origin), origin + '/share/a?x=1#v');
  assert.equal(api.localAppUrl('https://drive.google.com/file/d/id', origin), 'https://drive.google.com/file/d/id');
  assert.equal(api.appOriginFromHost(new URL(origin).host), origin);
}
for (const path of ['//evil.test','/\\evil.test','https://evil.test']) assert.equal(api.localReturnPath(path),'/app/home');
assert.equal(api.localReturnPath('/app/library?x=1'),'/app/library?x=1');
assert.equal(api.appOriginFromHost('evil.test'),'https://trusttale.co');
console.log('Domain-local links, external destinations and safe OAuth return paths passed.');
