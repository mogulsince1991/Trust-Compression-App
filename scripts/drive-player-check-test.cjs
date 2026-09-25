const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('app/drive-player-check/[id]/route.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exportsObject = {};
new Function('exports', compiled)(exportsObject);

(async () => {
  for (const size of [100, 75, 50]) {
    for (const shape of ['portrait', 'landscape']) {
      const response = await exportsObject.GET(new Request(`https://example.com/test?size=${size}&shape=${shape}`), { params: { id: 'test_drive_file' } });
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.equal((html.match(/<iframe /g) || []).length, 1);
      assert.ok(html.includes(`transform: scale(${size / 100})`));
      assert.ok(html.includes(`width: ${10000 / size}%`));
      assert.ok(html.includes(`aspect-ratio: ${shape === 'portrait' ? '9 / 16' : '16 / 9'}`));
      assert.ok(html.includes('https://drive.google.com/file/d/test_drive_file/preview'));
      assert.ok(!html.includes('<script'));
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  }
  const invalid = await exportsObject.GET(new Request('https://example.com'), { params: { id: '<script>' } });
  assert.equal(invalid.status, 400);
  const fallback = await exportsObject.GET(new Request('https://example.com?size=0&shape=%3Cscript%3E'), { params: { id: 'test_drive_file' } });
  const html = await fallback.text();
  assert.ok(html.includes('transform: scale(1)'));
  assert.ok(!html.includes('<script>'));
  console.log('Drive comparison: six layouts, input validation and safe defaults passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
