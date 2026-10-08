const { copyFileSync, cpSync, mkdirSync } = require('node:fs');
const { dirname, join } = require('node:path');
const root = dirname(require.resolve('pdfjs-dist/package.json'));
const target = join(__dirname, '../public/pdfjs');
mkdirSync(target, { recursive: true });
copyFileSync(join(root, 'legacy/build/pdf.worker.min.mjs'), join(target, 'pdf.worker.min.mjs'));
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  cpSync(join(root, directory), join(target, directory), { recursive: true });
}
