const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {}, URL };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/pdf-source.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const allowed = context.exports.allowedPdfSource;
assert.equal(allowed('https://file.notion.com/f/a.pdf?signature=example'), true);
assert.equal(allowed('https://prod-files-secure.s3.us-west-2.amazonaws.com/a.pdf'), true);
assert.equal(allowed('https://example.supabase.co/storage/v1/object/public/docs/a.pdf', 'https://example.supabase.co'), true);
for (const url of ['http://file.notion.com/a.pdf', 'https://file.notion.com.evil.test/a.pdf', 'https://127.0.0.1/a.pdf', 'https://user:pass@file.notion.com/a.pdf', 'https://file.notion.com:8443/a.pdf', 'https://example.supabase.co/rest/v1/users', 'https://other.supabase.co/storage/v1/object/public/a.pdf']) {
  assert.equal(allowed(url, 'https://example.supabase.co'), false, url);
}
const reader = fs.readFileSync('components/pdf-reader.tsx', 'utf8');
assert.match(reader, /document\.getPage\(page\)/);
assert.match(reader, /Previous page/);
assert.match(reader, /Next page/);
assert.match(reader, /page === document\.numPages/);
assert.match(reader, /render\?\.cancel/);
assert.match(reader, /event\.stopPropagation/);
assert.match(reader, /controller\.abort/);
const route = fs.readFileSync('app/api/media/pdf/route.ts', 'utf8');
assert.match(route, /journey\.is_public/);
assert.match(route, /workspace_members/);
assert.match(route, /redirect: "manual"/);
assert.match(route, /private, no-store/);
console.log('PDF host restrictions, page controls, cancellation, and journey access guards passed.');
