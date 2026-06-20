import { matchRecords } from "./match.js";
import { normalizeJobTreadJobs, normalizeSpendRows, normalizeWindsorContacts } from "./normalize.js";
import { isSoldJob, safeDivide, safeDivideOrNull } from "./domain.js";
import { sourceBucket } from "./attribution.js";
import type { ContractorCondition, ContractorMetricDefinition, ContractorRuleSetRecord } from "./config";

export function buildConfiguredMetricResults({
  ruleSet,
  report,
  startDate,
  endDate,
  leads = [],
  jobs = [],
  spendRows = [],
}: {
  ruleSet: ContractorRuleSetRecord;
  report: any;
  startDate: string;
  endDate: string;
  leads: any[];
  jobs: any[];
  spendRows: any[];
}) {
  const normalizedLeads = normalizeWindsorContacts(
    leads.map((row) => ({
      id: row.external_id || row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      source: row.source,
      campaign: row.campaign,
      createdDate: row.created_date,
      tags: Array.isArray(row.tags) ? row.tags.join(",") : row.tags,
      notesSummary: row.notes_summary,
    })),
    { startDate, endDate, rules: report.runtimeRules }
  );
  const normalizedJobs = normalizeJobTreadJobs(
    jobs.map((row) => ({
      id: row.external_id || row.id,
      jobId: row.external_id || row.id,
      jobNumber: row.job_number,
      customer: row.customer,
      email: row.email,
      phone: row.phone,
      appointmentDate: row.appointment_date,
      soldDate: row.sold_date,
      status: row.status,
      projectType: row.project_type,
      revenue: row.revenue,
      netSales: row.net_sales,
      designConsultant: row.design_consultant,
      projectManager: row.project_manager,
      source: row.source,
      campaign: row.campaign,
      notesSummary: row.notes_summary,
    })),
    { startDate, endDate }
  );
  const normalizedSpendRows = normalizeSpendRows(
    spendRows.map((row) => ({
      Date: row.spend_date,
      Vendor: row.vendor,
      Channel: row.channel,
      Campaign: row.campaign,
      Spend: row.spend,
      Leads: row.leads,
      trackable: row.trackable,
      sourceFile: row.source_file,
    })),
    { startDate, endDate }
  );

  const attributionMatches = matchRecords(normalizedLeads, normalizedJobs).matched;
  const joinedRecords = attributionMatches.map((match) => ({
    ...match.job,
    job: match.job,
    lead: match.lead,
    source: match.lead.source || match.job.source,
    campaign: match.lead.campaign || match.job.campaign,
    revenue: match.job.revenue,
    appointmentDate: match.job.appointmentDate,
    soldDate: match.job.soldDate,
  }));
  const baseValues = collectBaseMetricValues(report.metrics);
  const results: Array<{ id: string; name: string; value: number | string | null; displayType: string; formula?: string | null }> = [];

  for (const definition of ruleSet.metricDefinitions) {
    const predefined = definition.currentOutputPath ? readPath(report.metrics, definition.currentOutputPath.replace(/^metrics\./, "")) : undefined;
    let value = predefined;

    if (value === undefined) {
      value = evaluateMetricDefinition(definition, {
        startDate,
        endDate,
        baseValues,
        rules: report.runtimeRules,
        datasets: {
          contacts: normalizedLeads,
          jobs: normalizedJobs,
          marketing_spend_rows: normalizedSpendRows,
          matched_jobs: joinedRecords.filter((row) => row.appointmentDate),
          matched_sold_jobs: joinedRecords.filter((row) => isSoldJob(row.job, report.runtimeRules)),
          sold_jobs: normalizedJobs.filter((job) => isSoldJob(job, report.runtimeRules)),
        },
      });
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      baseValues[definition.id] = value;
    }

    results.push({
      id: definition.id,
      name: definition.name,
      value: value ?? null,
      displayType: definition.displayType,
      formula: definition.formula ?? null,
    });
  }

  return results;
}

function evaluateMetricDefinition(
  definition: ContractorMetricDefinition,
  context: {
    startDate: string;
    endDate: string;
    baseValues: Record<string, number>;
    rules: any;
    datasets: Record<string, any[]>;
  }
) {
  const dataset = context.datasets[definition.object] ?? [];
  const filtered = dataset.filter((record) => recordMatchesConditions(record, definition.conditions ?? [], context));

  if (definition.operation === "count") return filtered.length;
  if (definition.operation === "sum") return filtered.reduce((total, row) => total + Number(readMetricField(row, definition.field) ?? 0), 0);
  if (definition.operation === "average") {
    if (!filtered.length) return null;
    const total = filtered.reduce((sum, row) => sum + Number(readMetricField(row, definition.field) ?? 0), 0);
    return total / filtered.length;
  }
  if (definition.operation === "ratio" || definition.operation === "formula") {
    return evaluateFormula(definition.formula ?? "", context.baseValues);
  }

  return null;
}

function recordMatchesConditions(
  record: any,
  conditions: ContractorCondition[],
  context: { startDate: string; endDate: string; rules: any }
) {
  return conditions.every((condition) => evaluateCondition(record, condition, context));
}

function evaluateCondition(
  record: any,
  condition: ContractorCondition,
  context: { startDate: string; endDate: string; rules: any }
): boolean {
  if (condition.operator === "and") {
    return (condition.conditions ?? []).every((entry) => evaluateCondition(record, entry, context));
  }
  if (condition.operator === "or") {
    return (condition.conditions ?? []).some((entry) => evaluateCondition(record, entry, context));
  }
  if (condition.classification === "sourceBucket") {
    const bucket = sourceBucket(record.lead ?? record, context.rules);
    return compareValues(bucket, condition.operator, condition.value, condition.caseSensitive);
  }
  if (condition.ruleRef === "soldJob") {
    return isSoldJob(record.job ?? record, context.rules);
  }
  if (condition.ruleRef === "exclude_not_lead_tags") {
    const tags = String(readMetricField(record, "tags") ?? "").toLowerCase();
    return !tags.includes("not_lead") && !tags.includes("not a lead");
  }

  const rawValue = readMetricField(record, condition.field);
  const value = Array.isArray(condition.value)
    ? condition.value.map((entry) => replaceContextKeyword(entry, context))
    : replaceContextKeyword(condition.value, context);
  return compareValues(rawValue, condition.operator, value, condition.caseSensitive);
}

function compareValues(actual: any, operator: string, expected: any, caseSensitive = false) {
  const left = normalizeCompareValue(actual, caseSensitive);
  const right = normalizeCompareValue(expected, caseSensitive);

  switch (operator) {
    case "equals":
      return left === right;
    case "not_equals":
      return left !== right;
    case "contains":
      return String(left ?? "").includes(String(right ?? ""));
    case "not_contains":
      return !String(left ?? "").includes(String(right ?? ""));
    case "in":
      return Array.isArray(expected) ? expected.map((value) => normalizeCompareValue(value, caseSensitive)).includes(left) : false;
    case "not_in":
      return Array.isArray(expected) ? !expected.map((value) => normalizeCompareValue(value, caseSensitive)).includes(left) : true;
    case "exists":
      return actual != null && String(actual).trim() !== "";
    case "not_exists":
      return actual == null || String(actual).trim() === "";
    case "between":
      return compareBetween(actual, expected);
    case "greater_than":
      return Number(actual ?? 0) > Number(expected ?? 0);
    case "less_than":
      return Number(actual ?? 0) < Number(expected ?? 0);
    case "regex":
      return new RegExp(String(expected ?? ""), caseSensitive ? "" : "i").test(String(actual ?? ""));
    case "regex_any":
      return Array.isArray(expected)
        ? expected.some((pattern) => new RegExp(String(pattern), caseSensitive ? "" : "i").test(String(actual ?? "")))
        : false;
    default:
      return true;
  }
}

function compareBetween(actual: any, expected: any) {
  if (!Array.isArray(expected) || expected.length < 2 || !actual) return false;
  const value = new Date(String(actual));
  const start = new Date(String(expected[0]));
  const end = new Date(String(expected[1]));
  if (Number.isNaN(value.getTime()) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return value >= start && value <= end;
}

function normalizeCompareValue(value: any, caseSensitive = false) {
  if (typeof value === "string" && !caseSensitive) return value.toLowerCase();
  return value;
}

function replaceContextKeyword(value: any, context: { startDate: string; endDate: string }) {
  if (value === "startDate") return `${context.startDate}T00:00:00`;
  if (value === "endDate") return `${context.endDate}T23:59:59`;
  return value;
}

function readMetricField(record: any, field?: string | null) {
  if (!field) return null;
  return field.split(".").reduce((current, key) => current?.[key], record);
}

function collectBaseMetricValues(metrics: any) {
  return {
    overall_spend: Number(metrics?.totals?.spend ?? 0),
    overall_leads: Number(metrics?.totals?.leads ?? 0),
    paid_leads: Number(metrics?.totals?.paidLeads ?? 0),
    organic_leads: Number(metrics?.totals?.organicLeads ?? 0),
    overall_appointments: Number(metrics?.totals?.issuedLeads ?? 0),
    paid_appointments: Number(metrics?.totals?.paidIssuedLeads ?? 0),
    organic_appointments: Number(metrics?.totals?.organicIssuedLeads ?? 0),
    overall_sold_jobs: Number(metrics?.totals?.soldJobs ?? 0),
    paid_sold_jobs: Number(metrics?.totals?.paidSoldJobs ?? 0),
    organic_sold_jobs: Number(metrics?.totals?.organicSoldJobs ?? 0),
    overall_revenue: Number(metrics?.totals?.revenue ?? 0),
    paid_revenue: Number(metrics?.totals?.paidRevenue ?? 0),
    organic_revenue: Number(metrics?.totals?.organicRevenue ?? 0),
  };
}

function evaluateFormula(formula: string, values: Record<string, number>) {
  const expression = String(formula ?? "").trim();
  if (!expression || !/^[a-z0-9_+\-*/().\s]+$/i.test(expression)) return null;
  const compiled = expression.replace(/[a-z_][a-z0-9_]*/gi, (token) => String(values[token] ?? 0));
  try {
    const result = Function(`"use strict"; return (${compiled});`)();
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function readPath(value: any, path: string) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}
