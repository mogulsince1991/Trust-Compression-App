const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const exported = {};
let fail = false;
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/server/embed-metadata.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: exported, URL, AbortSignal, process: { env: {} },
  fetch: async url => {
    assert.match(url, /^https:\/\/www.youtube.com\/oembed\?/);
    assert.equal(new URL(url).searchParams.get('url'),'https://www.youtube.com/watch?v=abcdefghijk');
    if (fail) throw Error('Unavailable');
    return { ok: true, json: async () => ({ title: 'Original video title', thumbnail_url: 'provider-thumbnail' }) };
  }
});
(async () => {
  const asset = { sourcePlatform: 'youtube', sourceUrl: 'https://youtube.com/shorts/abcdefghijk', title: 'Fallback', thumbnailUrl: 'existing-thumbnail', metadata: { videoId: 'abcdefghijk' } };
  assert.equal((await exported.enrichEmbed(asset,false)).title,'Original video title');
  assert.equal((await exported.enrichEmbed(asset,true)).title,'Fallback');
  assert.equal((await exported.enrichEmbed(asset,false)).thumbnailUrl,'existing-thumbnail');
  fail=true;
  assert.equal((await exported.enrichEmbed(asset,false)).title,'Fallback');
  console.log('Default video title, custom title preservation, Shorts normalization and provider failure fallback passed.');
})().catch(error => { console.error(error); process.exitCode=1; });
