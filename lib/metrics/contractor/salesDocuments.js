import { dateKeyInTimeZone, inDateRange, toNumber } from "./domain.js";

export const SALES_RULE = Object.freeze({
  version: "document-sales-v1",
  provider: "jobtread", sourceObject: "documents", timezone: "America/New_York",
  recognizedTypes: ["customerOrder"], recognizedNames: ["Builder's Agreement", "Change Order", "Final Selections"],
  amountField: "priceWithTax", approvalHistoryField: "events.data.next.status",
  dateRangeField: "historicallyApprovedAt", qualifyingStatuses: ["approved", "signed", "open", "paid"],
  historicalApproval: "retain proven approval", supersession: "later approved same-code sequence replaces denied predecessor",
  grossCancellation: "retain", netCancellation: "exclude canceled jobs and revoked documents on closed jobs",
  groupingMode: "combine mixed codes per job; otherwise one row per document",
  consumers: ["revenue", "soldJobs", "paid", "organic", "source", "consultant", "averageTicket", "closeRate", "roas", "nsli", "detail", "export"],
});

export function isSalesDocument(doc) {
  return /customerOrder/i.test(doc.type ?? "") || /builder['’]?s agreement|change order|final selections?/i.test(doc.name ?? "");
}

export function normalizeSalesDocuments(rows = []) {
  const seen = new Set();
  const documents = rows.filter(isSalesDocument).map((doc, index) => {
    // Approval history is authoritative; never infer recognition from issue/sold/created dates.
    const approvedAt = doc.historicallyApprovedAt ?? doc.approvedAt ?? "";
    return {
      id: String(doc.id ?? ""), type: doc.type ?? "", name: doc.name ?? "", status: doc.status ?? "",
      code: doc.code || (/change order/i.test(doc.name ?? "") ? "CO" : /final selections?/i.test(doc.name ?? "") ? "FS" : "BA"),
      sequence: toNumber(doc.sequence ?? doc.number) || index + 1,
      amount: toNumber(doc.priceWithTax ?? doc.amount), approvedAt,
      recognitionDate: dateKeyInTimeZone(approvedAt, SALES_RULE.timezone),
      documentDate: dateKeyInTimeZone(doc.issueDate ?? doc.documentDate ?? approvedAt, SALES_RULE.timezone),
      createdAt: doc.createdAt ?? "", closedAt: doc.closedAt ?? "",
    };
  }).filter(doc => {
    if (!doc.approvedAt || !doc.recognitionDate || doc.amount <= 0) return false;
    if (doc.id && seen.has(doc.id)) return false;
    if (doc.id) seen.add(doc.id);
    return true;
  });
  return documents.filter(doc => !/denied|revoked/i.test(doc.status) || !documents.some(later =>
    later.code === doc.code && later.sequence > doc.sequence && /approved|signed|open|paid/i.test(later.status)
    && new Date(later.approvedAt) >= new Date(doc.approvedAt)));
}

export function salesRowsForJob(job, startDate, endDate) {
  const documents = normalizeSalesDocuments(job.approvedSalesDocuments).filter(doc =>
    (/approved|signed|open|paid/i.test(doc.status) || job.cancelled || job.closedOn)
    && (!startDate || inDateRange(doc.approvedAt, startDate, endDate, SALES_RULE.timezone))
  ).sort((a, b) => a.sequence - b.sequence);
  const groups = new Set(documents.map(doc => doc.code)).size > 1 ? [documents] : documents.map(doc => [doc]);
  return groups.filter(group => group.length).map(group => {
    const representative = group.at(-1);
    const amountParts = [...group].reverse().map(doc => doc.amount);
    const amount = Math.round(amountParts.reduce((sum, value) => sum + value, 0) * 100) / 100;
    const cancelled = Boolean(job.cancelled || group.some(doc => /denied|revoked/i.test(doc.status) && job.closedOn));
    return {
      jobId: job.id, jobNumber: job.jobNumber, customerName: job.customer,
      documentId: representative.id, documentIds: group.map(doc => doc.id),
      documentCode: representative.code, documentNumber: `${representative.code} ${job.jobNumber || job.id}-${representative.sequence}`,
      documentDate: representative.documentDate, date: representative.documentDate,
      approvalDate: representative.recognitionDate, approvalTimestamp: representative.approvedAt,
      documentStatus: representative.status, documentCount: group.length,
      amount, soldAmount: amount, amountParts,
      amountBreakdown: amountParts.length > 1 ? amountParts.map(value => value.toFixed(2)).join(" + ") : "",
      cancelled, jobStatus: cancelled ? "Cancelled" : job.status,
      consultant: job.designConsultant, setter: "", source: job.source, components: group,
    };
  });
}

export function summarizeSalesRows(rows) {
  const net = rows.filter(row => !row.cancelled);
  const summary = items => ({ count: items.length, documentCount: items.reduce((n, row) => n + row.documentCount, 0),
    jobs: new Set(items.map(row => row.jobId)).size,
    total: Math.round(items.reduce((n, row) => n + row.amount, 0) * 100) / 100 });
  return { mode: "api-generated", authority: SALES_RULE.version, source: "JobTread document approval history", gross: summary(rows), net: summary(net), rows };
}
