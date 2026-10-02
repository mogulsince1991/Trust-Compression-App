const assert = require("node:assert/strict");
const fs = require("node:fs");
for (const file of ["app/share/[token]/page.tsx", "app/embed/journey/[token]/page.tsx"]) {
  const source = fs.readFileSync(file, "utf8");
  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.match(source, /export const fetchCache = "force-no-store"/);
  assert.match(source, /heading: row.heading/);
  assert.match(source, /description: row.description/);
}
console.log("Shared pages and embeds bypass page and data caches and render saved copy.");
