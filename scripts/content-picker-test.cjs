const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/journey-embeds.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exported, URL });
for (const extension of ['jpg','png','webp','gif','avif']) {
  const asset = exported.normalizeJourneyEmbed({ url: `https://example.com/project.${extension}`, title: 'Project photo' });
  assert.equal(asset.sourcePlatform, 'image');
  assert.equal(asset.thumbnailUrl, asset.sourceUrl);
}
assert.equal(exported.normalizeJourneyEmbed({ url: 'https://example.com/guide.pdf' }).assetType, 'pdf');
assert.throws(() => exported.normalizeJourneyEmbed({ url: 'javascript:alert(1)' }));
const picker = fs.readFileSync('components/add-content-panel.tsx','utf8');
for (const kind of ['file','video','folder','channel']) assert.ok(picker.includes(`id: "${kind}"`));
assert.match(picker, /collection \? onImport/);
assert.match(fs.readFileSync('app/api/journeys/[id]/route.ts','utf8'), /rpc\("replace_journey_assets"/);
assert.doesNotMatch(fs.readFileSync('app/api/journeys/[id]/route.ts','utf8'), /from\("journey_assets"\)\.delete/);
console.log('Content types, image links, unsafe URL rejection and transactional update wiring passed.');
