const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    { exports, require: name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name), Intl, Date, console, process });
  return exports;
}
const { buildReport } = load('lib/metrics/contractor/report.js');
const { buildConfiguredMetricResults, buildConfiguredDashboard, buildMetricEvaluationContext } = load('lib/metrics/contractor/configuredMetrics.ts');
const { createDefaultContractorRuleSet, toRuntimeMetricRules } = load('lib/metrics/contractor/config.ts');
const doc = (id, amount, approvedAt, extra = {}) => ({ id, type: 'customerOrder', name: "Builder's Agreement", status: 'approved', amount, approvedAt, ...extra });
function report(jobs, extra = {}) {
  return buildReport({ client: 'Test', startDate: '2026-05-01', endDate: '2026-05-08', allowArchivedSpend: false, jobtreadRows: jobs, ...extra });
}
const jobs = [
  { jobId: 'old', jobNumber: '1', appointmentDate: '2020-01-01', soldDate: '2020-01-01', source: 'Google Ads', revenue: 999999, approvedSalesDocuments: [doc('a', 100, '2026-05-02')] },
  { jobId: 'missing', jobNumber: '2', soldDate: '2026-05-03', revenue: 999999 },
  { jobId: 'mixed', jobNumber: '3', source: 'Organic', approvedSalesDocuments: [doc('b', 50, '2026-05-03', { name: 'Change Order', sequence: 2 }), doc('c', 25, '2026-05-04', { name: 'Final Selections', sequence: 3 })] },
  { jobId: 'cancel', jobNumber: '4', status: 'Canceled', approvedSalesDocuments: [doc('d', 30, '2026-05-03')] },
  { jobId: 'denied', jobNumber: '5', closedOn: '2026-06-01', approvedSalesDocuments: [doc('e', 20, '2026-05-03', { status: 'denied' })] },
  { jobId: 'late', jobNumber: '6', approvedSalesDocuments: [doc('f', 1000, '2026-05-09T04:00:00.000Z')] },
  { jobId: 'boundary', jobNumber: '7', approvedSalesDocuments: [doc('g', 1, '2026-05-09T03:59:59.999Z')] },
];
const r = report(jobs);
assert.equal(r.metrics.totalSalesReport.gross.total, 226);
assert.equal(r.metrics.totalSalesReport.net.total, 176);
assert.equal(r.metrics.totals.revenue, 176);
assert.equal(r.metrics.totals.soldJobs, 3);
assert.equal(r.metrics.totals.paidRevenue, 100);
assert.equal(r.metrics.totals.organicRevenue, 76);
assert.equal(r.metrics.totalSalesReport.gross.documentCount, 6);
assert.equal(r.metrics.totalSalesReport.gross.count, 5);
assert.equal(r.metrics.byLeadSource.reduce((n,x)=>n+x.revenue,0),176);
assert.equal(r.metrics.byDesignConsultant.reduce((n,x)=>n+x.revenue,0),176);
r.runtimeRules = toRuntimeMetricRules(createDefaultContractorRuleSet());
const configured = buildConfiguredMetricResults({ ruleSet: createDefaultContractorRuleSet(), report: r, startDate: r.startDate, endDate: r.endDate });
for (const [id, value] of [['overall_revenue',176],['paid_revenue',100],['organic_revenue',76],['overall_sold_jobs',3]]) assert.equal(configured.find(x=>x.id===id).value, value, id);
assert.equal(report([{jobId:'nohistory', approvedSalesDocuments:[doc('x',100,'')]}]).metrics.totals.revenue,0);
const superseded = report([{ jobId:'revisions', approvedSalesDocuments:[doc('old',100,'2026-05-02',{status:'denied',sequence:1}),doc('new',200,'2026-05-03',{sequence:2})],closedOn:'2026-05-07' }]);
assert.equal(superseded.metrics.totalSalesReport.gross.total,200);
const activeDenied = report([{jobId:'active-denied', approvedSalesDocuments:[doc('old',100,'2026-05-02',{status:'denied'})]}]);
assert.equal(activeDenied.metrics.totalSalesReport.gross.total,0,'Confirmed local rule: revoked on open, non-canceled job is excluded');
const reconciled = report(jobs.map(job=>({...job,appointmentDate:'2026-05-04',designConsultant:'Consultant'})), {
  uploadedSpendRows:[{Date:'2026-05-02',Vendor:'Google',Spend:50}],
  attributionRows:[{id:'older',name:'Old contact',createdDate:'2020-01-01',phone:'5551234567',source:'Google Ads'}],
});
reconciled.runtimeRules = r.runtimeRules;
const defs = createDefaultContractorRuleSet();
const values = Object.fromEntries(buildConfiguredMetricResults({ ruleSet:defs, report:reconciled,startDate:r.startDate,endDate:r.endDate, spendRows:[{spend_date:'2026-05-02',vendor:'Google',spend:50}] }).map(x=>[x.id,x.value]));
assert.equal(values.paid_roas,2);
assert.equal(values.average_ticket,176/3);
assert.equal(values.paid_average_ticket,100);
assert.equal(values.organic_average_ticket,38);
assert.equal(values.overall_close_rate,3/7);
assert.equal(values.overall_nsli,176/7);
const context = buildMetricEvaluationContext({report:reconciled,startDate:r.startDate,endDate:r.endDate});
const dashboard = buildConfiguredDashboard({ruleSet:defs,report:reconciled,context});
assert.equal(dashboard.leadsBySource.reduce((n,row)=>n+row.revenue,0),176);
assert.equal(dashboard.designConsultantPerformance.reduce((n,row)=>n+row.revenue,0),176);
assert.equal(dashboard.paidChannelPerformance.reduce((n,row)=>n+row.revenue,0),100);
console.log('Document authority, cancellations, mixed components, Eastern boundaries, and configured totals passed.');

if (process.env.LOCAL_SALES_CACHE) {
  const expected = [ ['2026-05-01','2026-05-31',10,328292.95,9,166949.20], ['2026-06-01','2026-06-30',18,411825.24,16,374122.12], ['2026-07-01','2026-07-31',16,333820.05,13,272061.06], ['2026-05-01','2026-05-08',3,72877.20] ];
  for (const [startDate,endDate,grossCount,gross,netCount,net] of expected) {
    const snapshotEnd = endDate === '2026-05-08' ? '2026-05-31' : endDate;
    const prefix = path.join(process.env.LOCAL_SALES_CACHE, `mi_remodelers__${startDate}__${snapshotEnd}`);
    const read = suffix => JSON.parse(fs.readFileSync(prefix+suffix, 'utf8'));
    const result = report(read('__jobtread.json'), { startDate, endDate, windsorRows: read('__windsor-ghl.json'), attributionRows: read('__windsor-ghl-attribution.json') });
    const actual = result.metrics.totalSalesReport;
    console.log(startDate,endDate,JSON.stringify({gross:actual.gross,net:actual.net}));
    assert.equal(actual.gross.count,grossCount); assert.equal(actual.gross.total,gross);
    if(net != null) { assert.equal(actual.net.count,netCount); assert.equal(actual.net.total,net); }
  }
}
