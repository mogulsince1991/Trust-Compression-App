const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), XLSX = require('xlsx');
function load(file) {
  if (!fs.existsSync(file)) file += '.ts';
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Date, require: name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name) });
  return exports;
}
const { readSpendWorkbook, parseSpendSheet } = load('lib/metrics/contractor/spend-excel.ts');
const { validateSpendRows, parseSpendCsv, spendMonths } = load('lib/metrics/contractor/spend-input.ts');
assert.equal(spendMonths([{date:'2026-08-03'}, {date:'2026-08-20'}]).join(','), '2026-08');
assert.equal(spendMonths([{date:'2026-08-03'}, {date:'2026-09-01'}]).join(','), '2026-08,2026-09');
assert.equal(spendMonths([{date:''}]).length, 0);
for (const bookType of ['xlsx', 'biff8']) {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([['Date', 'Vendor', 'Spend'], [46143, 'Google Ads', 1234.50], ['2026-05-02', 'Meta', 100]]);
  sheet.A2.z = 'm/d/yy';
  XLSX.utils.book_append_sheet(book, sheet, 'May');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Notes'], ['Do not import']]), 'Notes');
  const bytes = XLSX.write(book, { bookType, type: 'array' });
  const parsed = readSpendWorkbook(bytes);
  assert.equal(parsed.sheets.length, 2);
  const rows = parseSpendSheet(parsed.workbook, 'May', '2026-05');
  assert.equal(rows[0].date, '2026-05-01'); assert.equal(rows[0].spend, 1234.50);
  assert.throws(() => parseSpendSheet(parsed.workbook, 'Notes', '2026-05'), /Missing/);
  assert.throws(() => parseSpendSheet(parsed.workbook, 'May', '2026-06'), /within/);
}
const mac = XLSX.utils.book_new(); mac.Workbook = { WBProps: { date1904: true } };
XLSX.utils.book_append_sheet(mac, XLSX.utils.aoa_to_sheet([['Date','Vendor','Spend'], [44681,'Mac date',5]]), 'Spend');
assert.equal(parseSpendSheet(mac, 'Spend', '2026-05')[0].date, '2026-05-01');
mac.Sheets.Spend.C2 = { t: 'n', f: '1+4' };
assert.throws(() => parseSpendSheet(mac, 'Spend', '2026-05'), /unsaved formula/);
mac.Sheets.Spend.C2.v = 5;
assert.equal(parseSpendSheet(mac, 'Spend', '2026-05')[0].spend, 5);
const preview = parseSpendCsv('Date,Vendor,Spend\n2026-05-01,Google,10\n,Total,10', '2026-05', false);
assert.equal(preview.length, 2);
assert.equal(validateSpendRows(preview.slice(0,1), '2026-05').length, 1);
assert.throws(() => validateSpendRows(preview, '2026-05'), /Row 2/);
console.log('XLSX, XLS, sheet selection, Excel/Mac dates, cached formulas and preview row exclusion passed.');
const report = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(report, XLSX.utils.aoa_to_sheet([
  ['Monthly report'], ['Company'], ['August 2026'], [],
  ['', 'Transaction date', 'Transaction type', 'Name', 'Amount', 'Balance'],
  ['Vendor'], ['', '08/03/2026', 'Expense', 'Vendor', 25, 25],
  ['Total for Vendor', '', '', '', 25], ['TOTAL', '', '', '', 25], ['Accrual Basis']
]), 'Report');
const reportRows = parseSpendSheet(report, 'Report', '2026-08');
assert.equal(reportRows.length, 1);
assert.equal(reportRows[0].date, '2026-08-03');
assert.equal(reportRows[0].spend, 25);
if (process.argv[2]) {
  const actual = readSpendWorkbook(fs.readFileSync(process.argv[2]));
  const rows = parseSpendSheet(actual.workbook, actual.sheets[0], '2026-08');
  assert.equal(spendMonths(rows).join(','), '2026-08');
  const total = rows.reduce((sum, row) => sum + Math.round(row.spend * 100), 0) / 100;
  assert.equal(total, 24603.23);
  console.log(`Provided workbook: ${rows.length} transactions, $${total}; totals excluded.`);
}
console.log('Grouped accounting report headers, US dates and subtotal exclusion passed.');
