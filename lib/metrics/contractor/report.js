import { parseCsv, rowsToObjects } from "./csv.js";
import { matchRecords } from "./match.js";
import { calculateReportMetrics } from "./metrics.js";
import { normalizeJobTreadJobs, normalizeSpendRows, normalizeWindsorContacts } from "./normalize.js";
import { loadArchivedSpendRows } from "./spendArchive.js";

export function buildReport({ client, startDate, endDate, spendCsv = "", uploadedSpendRows = [], windsorRows = [], attributionRows = windsorRows, jobtreadRows = [] }) {
  const csvSpendRows = normalizeSpendRows(rowsToObjects(parseCsv(spendCsv)), { startDate, endDate });
  const workbookSpendRows = normalizeSpendRows(uploadedSpendRows, { startDate, endDate });
  const providedSpendRows = workbookSpendRows.length ? workbookSpendRows : csvSpendRows;
  const archivedSpend = providedSpendRows.length ? { rows: [], sources: [], warnings: [] } : loadArchivedSpendRows({ startDate, endDate });
  const spendRows = providedSpendRows.length ? providedSpendRows : normalizeSpendRows(archivedSpend.rows, { startDate, endDate });
  const leads = normalizeWindsorContacts(windsorRows, { startDate, endDate });
  const attributionLeads = normalizeWindsorContacts(attributionRows);
  const jobs = normalizeJobTreadJobs(jobtreadRows, { startDate, endDate });
  const matches = matchRecords(leads, jobs);
  const attributionMatches = matchRecords(attributionLeads, jobs);
  const metrics = calculateReportMetrics({ spendRows, leads, jobs, matches: matches.matched, attributionMatches: attributionMatches.matched });
  const spendSource = providedSpendRows.length ? "uploaded" : spendRows.length ? "archive" : "none";

  return {
    client,
    startDate,
    endDate,
    generatedAt: new Date().toISOString(),
    spend: {
      source: spendSource,
      rows: spendRows.length,
      sources: archivedSpend.sources,
      warnings: archivedSpend.warnings,
    },
    metrics,
    executiveSummary: buildExecutiveSummary(metrics, { spendSource, warnings: archivedSpend.warnings }),
    unmatched: {
      leads: matches.unmatchedLeads,
      jobs: matches.unmatchedJobs,
    },
    detail: {
      spendRows,
      attributionMatchedRecords: attributionMatches.matched.map(({ lead, job, matchKey }) => ({
        matchKey,
        leadId: lead.id,
        jobId: job.id,
        name: lead.name || job.customer,
        source: lead.source || job.source,
        campaign: lead.campaign || job.campaign,
        revenue: job.revenue,
        soldDate: job.soldDate,
      })),
      matchedRecords: matches.matched.map(({ lead, job, matchKey }) => ({
        matchKey,
        leadId: lead.id,
        jobId: job.id,
        email: lead.email || job.email,
        phone: lead.phone || job.phone,
        source: lead.source || job.source,
        campaign: lead.campaign || job.campaign,
        revenue: job.revenue,
        soldDate: job.soldDate,
        designConsultant: job.designConsultant,
      })),
    },
  };
}

function buildExecutiveSummary(metrics, { spendSource, warnings } = {}) {
  const spendLine = metrics.totals.spendProvided
    ? `Spend was ${money(metrics.totals.spend)} from ${spendSource === "archive" ? "the historic spend archive" : "the uploaded spend file"} with ${metrics.totals.roas?.toFixed(2) ?? "N/A"}x paid ROAS.`
    : "Marketing spend was not provided, so spend-based KPIs are unavailable.";
  return [
    spendLine,
    ...(warnings ?? []),
    `Overall, ${metrics.totals.leads} qualifying leads produced ${metrics.totals.issuedLeads} booked appointments, ${metrics.totals.soldJobs} sold jobs, and ${money(metrics.totals.revenue)} revenue.`,
    `Paid channels produced ${metrics.totals.paidLeads} leads, ${metrics.totals.paidIssuedLeads} booked appointments, ${metrics.totals.paidSoldJobs} sold jobs, and ${money(metrics.totals.paidRevenue)} revenue.`,
    `Organic/non-paid channels produced ${metrics.totals.organicLeads} leads, ${metrics.totals.organicIssuedLeads} booked appointments, ${metrics.totals.organicSoldJobs} sold jobs, and ${money(metrics.totals.organicRevenue)} revenue.`,
    `Average ticket value per closed job was ${money(metrics.totals.averageJobSize)} overall, ${money(metrics.totals.paidAverageJobSize)} for paid, and ${money(metrics.totals.organicAverageJobSize)} for organic/non-paid.`,
    `Average time to close was ${metrics.totals.averageTimeToClose} overall, ${metrics.totals.paidAverageTimeToClose} for paid, and ${metrics.totals.organicAverageTimeToClose} for organic/non-paid.`,
  ];
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
