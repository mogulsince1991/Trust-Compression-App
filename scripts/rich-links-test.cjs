const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/rich-links.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: exported, URL });
const origin = 'https://trusttale.co';
assert.equal(exported.richLinkImage({ thumbnailUrl: '/cover.png' }, origin), origin + '/cover.png');
assert.equal(exported.richLinkImage({ thumbnailUrl: 'javascript:alert(1)' }, origin), null);
assert.equal(exported.richLinkImage({ thumbnailUrl: 'https://user:secret@example.com/a.jpg' }, origin), null);
assert.equal(exported.richLinkImage({}, origin), null);
const drive = { sourceUrl: 'https://drive.google.com/file/d/abcdefghijk/view', thumbnailUrl: 'https://example.com/expired.jpg' };
assert.equal(exported.richLinkImage(drive, origin), origin + '/api/media/drive/abcdefghijk/preview?image=1&size=1200');
assert.equal(exported.richLinkImage({ ...drive, metadata: { localThumbnailOverride: true } }, origin), drive.thumbnailUrl);
assert.match(exported.richLinkImage({ sourceUrl: 'https://vimeo.com/123' }, origin), /\/api\/media\/thumbnail\?url=/);
for (const agent of ['facebookexternalhit/1.1', 'Twitterbot/1.0', 'Applebot', 'WhatsApp/2', 'Slackbot-LinkExpanding']) assert.equal(exported.isLinkPreviewAgent(agent), true);
assert.equal(exported.isLinkPreviewAgent('Mozilla/5.0 (iPhone) AppleWebKit Safari/604.1'), false);
const page = fs.readFileSync('app/share/[token]/page.tsx', 'utf8');
assert.match(page, /generateMetadata/);
assert.match(page, /\.eq\("is_public", true\)\.is\("deleted_at", null\)/);
assert.doesNotMatch(page, /\.insert\(/);
assert.match(page, /index: false/);
console.log('Rich links: thumbnails, public Drive previews, safe image URLs, crawler filtering and read-only metadata passed.');
