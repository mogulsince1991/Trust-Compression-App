const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(path, context = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require, URL, URLSearchParams, AbortSignal, ...context });
  return exports;
}
const provider = load('lib/source-import.ts', { fetch: async url => {
  const child = new URL(url).searchParams.get('q').includes("'nested'");
  return Response.json({ files: child ? [{ id: 'photochild123', name: 'Kitchen.jpg', mimeType: 'image/jpeg' }] : [{ id: 'nested', mimeType: 'application/vnd.google-apps.folder' }, { id: 'photo123456', name:'Roof.png', mimeType:'image/png' }, { id:'video123456', mimeType:'video/mp4' }] });
} });
const images = load('lib/server/drive-image-import.ts');
let existing = null, saved;
const db = { from(table) { assert.equal(table,'library_assets'); return { select(){return this},eq(){return this},async maybeSingle(){return {data:existing}},insert(payload){saved=payload;return Promise.resolve({error:null})},update(payload){saved=payload;return this},then(resolve){resolve({error:null})} }; } };
(async () => {
  const items = await provider.importSourceVideos(provider.parseSourceUrl('https://drive.google.com/drive/folders/root123456'), {driveApiKey:'test'});
  assert.equal(items.length,3);
  assert.equal(items.filter(x=>x.metadata.mimeType.startsWith('image/')).length,2);
  const file={id:'photo123456',title:'Roof.png',metadata:{mimeType:'image/png'}};
  assert.equal((await images.saveDriveImage(db,'workspace-a',file,'user')).imported,1);
  assert.equal(saved.source_platform,'image'); assert.equal(saved.asset_type,'embed');
  assert.match(saved.embed_url,/image=1/);
  const firstId=saved.id;
  await images.saveDriveImage(db,'workspace-b',file,'user'); assert.notEqual(saved.id,firstId);
  existing={id:firstId,title:'Custom',metadata:{localTitleOverride:true}};
  assert.equal((await images.saveDriveImage(db,'workspace-a',file,'user',true)).skippedDuplicates,1);
  await images.saveDriveImage(db,'workspace-a',file,'user'); assert.equal(saved.title,'Custom');
  console.log('Recursive Drive photo discovery, image persistence, workspace IDs, duplicate skips and title preservation passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
