const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.createSourceFile('library.tsx', fs.readFileSync('components/sage-library.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let checked = false;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'aside') {
    assert.ok(node.openingElement.attributes.properties.some(a => a.name?.text === 'key'), 'Changing assets must reset the entire preview panel');
    const keys = node.children.flatMap(child => {
      const opening = ts.isJsxElement(child) ? child.openingElement : ts.isJsxSelfClosingElement(child) ? child : null;
      const key = opening?.attributes.properties.find(a => a.name?.text === 'key');
      return key ? [key.initializer.getText(source)] : [];
    });
    assert.equal(new Set(keys).size, keys.length, 'Preview siblings must never share React keys');
    checked = true;
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(checked);
console.log('Library preview panel reset and unique sibling keys passed.');
