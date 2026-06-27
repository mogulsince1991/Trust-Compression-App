import { matchRecords } from "./match.js";
import { analyzeClosingOutcomes } from "./outcomes.js";
import { matchesVendor, sourceBucket } from "./attribution.js";
import { isSoldJob } from "./domain.js";
import { normalizeJobTreadJobs, normalizeSpendRows, normalizeWindsorContacts } from "./normalize.js";
import { easternDateTime, timeToClose, timeToCloseDays } from "./timeToClose.js";
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
  const context = buildMetricEvaluationContext({
    report,
    startDate,
    endDate,
    leads,
    jobs,
    spendRows,
  });
  const results: Array<{
    id: string;
    name: string;
    value: number | string | null;
    displayType: string;
    formula?: string | null;
    source?: string | null;
    provider?: string | null;
    object?: string | null;
    operation?: string | null;
    field?: string | null;
    dateField?: string | null;
    description?: string | null;
    conditions?: ContractorCondition[];
  }> = [];

  for (const definition of ruleSet.metricDefinitions) {
    const value = evaluateMetricDefinition(definition, context);

    if (typeof value === "number" && Number.isFinite(value)) {
      context.baseValues[definition.id] = value;
    }

    results.push({
      id: definition.id,
      name: definition.name,
      value: value ?? null,
      displayType: definition.displayType,
      formula: definition.formula ?? null,
      source: definition.source ?? null,
      provider: definition.provider ?? null,
      object: definition.object ?? null,
      operation: definition.operation,
      field: definition.field ?? null,
      dateField: definition.dateField ?? null,
      description: definition.description ?? null,
      conditions: definition.conditions ?? [],
    });
  }

  return results;
}

export function buildMetricEvaluationContext({
  report,
  startDate,
  endDate,
  leads = [],
  jobs = [],
  spendRows = [],
}: {
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
    { startDate, endDate, rules: report.runtimeRules }
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
    { startDate, endDate, timeZone: report.runtimeRules?.timezone }
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
    timeToCloseDays: timeToCloseDays({ leadCreatedDate: match.lead.createdDate, soldDate: match.job.soldDate }),
  }));

  return {
    startDate,
    endDate,
    baseValues: {},
    rules: report.runtimeRules,
    datasets: {
      contacts: normalizedLeads,
      jobs: normalizedJobs,
      marketing_spend_rows: normalizedSpendRows,
      matched_jobs: joinedRecords.filter(
        (row) => row.appointmentDate && row.job?.inReportAppointment !== false
      ),
      matched_sold_jobs: joinedRecords.filter((row) => isSoldJob(row.job, report.runtimeRules) && row.job.inReportSold !== false),
      sold_jobs: normalizedJobs.filter((job) => isSoldJob(job, report.runtimeRules) && job.inReportSold !== false),
    },
  };
}

export function buildConfiguredDashboard({
  ruleSet,
  report,
  context,
}: {
  ruleSet: ContractorRuleSetRecord;
  report: any;
  context: ReturnType<typeof buildMetricEvaluationContext>;
}) {
  const groupedRows = buildGroupedMetricRows(ruleSet, context);
  return {
    paidChannelPerformance: groupedRows.paid_channel_performance ?? [],
    designConsultantPerformance: groupedRows.design_consultant_performance ?? [],
    leadsBySource: groupedRows.leads_by_source ?? [],
    jobsSoldDetail: buildJobsSoldDetail(context),
    closingOutcomes:
      groupedRows.closing_outcomes ??
      analyzeClosingOutcomes(
        context.datasets.jobs.filter((job) => job.inReportAppointment !== false),
        context.rules
      ),
    unmatchedRecords: {
      leads: report.unmatched?.leads ?? [],
      jobs: report.unmatched?.jobs ?? [],
    },
  };
}

function buildGroupedMetricRows(
  ruleSet: ContractorRuleSetRecord,
  context: {
    startDate: string;
    endDate: string;
    rules: any;
    datasets: Record<string, any[]>;
  }
) {
  const metricsById = new Map(ruleSet.metricDefinitions.map((definition) => [definition.id, definition]));
  const results: Record<string, any[]> = {};

  for (const groupedSet of ruleSet.groupedMetricSets ?? []) {
    const baseDataset = context.datasets[groupedSet.object] ?? [];
    const groupValues = uniqueGroupValues(baseDataset, groupedSet.groupBy);
    const rows = groupValues.map((groupValue) => {
      const scopedContext = createGroupedContext(context, groupedSet.id, groupValue);
      const metricValues = evaluateMetricIds(groupedSet.metricIds, metricsById, scopedContext);
      return formatGroupedRow(groupedSet.id, groupValue, metricValues);
    });
    results[groupedSet.id] = rows.filter(Boolean);
  }

  return results;
}

function createGroupedContext(
  context: {
    startDate: string;
    endDate: string;
    rules: any;
    datasets: Record<string, any[]>;
  },
  groupedSetId: string,
  groupValue: string
) {
  const datasets = Object.fromEntries(
    Object.entries(context.datasets).map(([datasetKey, records]) => [
      datasetKey,
      records.filter((record) => matchesGroupedRecord(groupedSetId, groupValue, datasetKey, record, context.rules)),
    ])
  );

  return {
    startDate: context.startDate,
    endDate: context.endDate,
    rules: context.rules,
    datasets,
    baseValues: {},
  };
}

function evaluateMetricIds(
  metricIds: string[],
  metricsById: Map<string, ContractorMetricDefinition>,
  context: {
    startDate: string;
    endDate: string;
    baseValues: Record<string, number>;
    rules: any;
    datasets: Record<string, any[]>;
  }
) {
  const values: Record<string, number | string | null> = {};

  for (const definition of Array.from(metricsById.values())) {
    const value = evaluateMetricDefinition(definition, context);
    values[definition.id] = value ?? null;
    if (typeof value === "number" && Number.isFinite(value)) {
      context.baseValues[definition.id] = value;
    }
  }

  return metricIds.reduce((result, metricId) => {
    result[metricId] = values[metricId] ?? null;
    return result;
  }, {} as Record<string, number | string | null>);
}

function formatGroupedRow(groupedSetId: string, groupValue: string, metricValues: Record<string, number | string | null>) {
  if (groupedSetId === "paid_channel_performance") {
    return {
      name: groupValue,
      spend: numericMetric(metricValues.overall_spend),
      leads: numericMetric(metricValues.paid_leads),
      issuedLeads: numericMetric(metricValues.paid_appointments),
      soldJobs: numericMetric(metricValues.paid_sold_jobs),
      revenue: numericMetric(metricValues.paid_revenue),
      costPerLead: nullableMetric(metricValues.cost_per_paid_lead),
      costPerIssuedLead: nullableMetric(metricValues.cost_per_paid_appointment),
      roas: nullableMetric(metricValues.paid_roas),
      closeRate: nullableMetric(metricValues.paid_close_rate),
    };
  }
  if (groupedSetId === "design_consultant_performance") {
    return {
      designConsultant: groupValue,
      appointments: numericMetric(metricValues.overall_appointments),
      soldJobs: numericMetric(metricValues.overall_sold_jobs),
      revenue: numericMetric(metricValues.overall_revenue),
      closeRate: nullableMetric(metricValues.overall_close_rate),
      averageJobSize: nullableMetric(metricValues.average_ticket),
      revenuePerAppointment: nullableMetric(metricValues.overall_nsli),
    };
  }
  if (groupedSetId === "leads_by_source") {
    return {
      source: groupValue,
      leads: numericMetric(metricValues.overall_leads),
      issuedLeads: numericMetric(metricValues.overall_appointments),
      soldJobs: numericMetric(metricValues.overall_sold_jobs),
      revenue: numericMetric(metricValues.overall_revenue),
      closeRate: nullableMetric(metricValues.overall_close_rate),
      netSalesPerLeadIssued: nullableMetric(metricValues.overall_nsli),
    };
  }
  if (groupedSetId === "closing_outcomes") {
    return {
      reason: groupValue,
      jobs: numericMetric(metricValues.overall_appointments),
      examples: [],
      description: "Config-derived grouped outcome count.",
    };
  }
  return null;
}

function buildJobsSoldDetail(context: {
  datasets: Record<string, any[]>;
  rules: any;
}) {
  return (context.datasets.sold_jobs ?? []).map((job) => {
    const matchedRecord = (context.datasets.matched_sold_jobs ?? []).find((row) => row.job?.id === job.id);
    const lead = matchedRecord?.lead;
    const attributedSource = matchedRecord?.source || job.source;
    return {
      jobId: job.id,
      customer: job.customer,
      projectType: job.projectType,
      soldDate: job.soldDate,
      leadCreatedEastern: easternDateTime(lead?.createdDate, context.rules),
      timeToClose: timeToClose({ leadCreatedDate: lead?.createdDate, soldDate: job.soldDate }),
      attributedSource,
      sourceBucket: sourceBucket({ ...job, source: attributedSource, campaign: matchedRecord?.campaign, notesSummary: job.notesSummary }, context.rules),
      designConsultant: job.designConsultant,
      projectManager: job.projectManager,
      revenue: job.revenue,
    };
  });
}

function matchesGroupedRecord(groupedSetId: string, groupValue: string, datasetKey: string, record: any, rules: any) {
  if (groupedSetId === "paid_channel_performance") {
    if (datasetKey === "marketing_spend_rows") return String(record.vendor || "Unassigned") === groupValue;
    return matchesVendor(groupValue, record.lead ?? record.job ?? record, rules);
  }
  if (groupedSetId === "design_consultant_performance") {
    return String(readMetricField(record.job ?? record, "designConsultant") || "Unassigned") === groupValue;
  }
  if (groupedSetId === "leads_by_source") {
    const sourceValue =
      readMetricField(record.lead ?? record, "source") ||
      readMetricField(record.job ?? record, "source") ||
      readMetricField(record.lead ?? record, "campaign") ||
      readMetricField(record.job ?? record, "campaign") ||
      "Unassigned";
    return String(sourceValue) === groupValue;
  }
  if (groupedSetId === "closing_outcomes") {
    return String(readMetricField(record.job ?? record, "status") || "Unassigned") === groupValue;
  }
  return true;
}

function uniqueGroupValues(records: any[], field: string) {
  return Array.from(
    new Set(records.map((record) => String(readMetricField(record, field) || "Unassigned")).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right));
}

function numericMetric(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function nullableMetric(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : null;
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
  const filtered = dataset.filter((record) => {
    if (!recordMatchesDateField(record, definition, context)) return false;
    return recordMatchesConditions(record, definition.conditions ?? [], context);
  });

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

function recordMatchesDateField(
  record: any,
  definition: ContractorMetricDefinition,
  context: { startDate: string; endDate: string }
) {
  if (!definition.dateField) return true;
  const rawValue = readMetricField(record, definition.dateField);
  return compareBetween(rawValue, [`${context.startDate}T00:00:00`, `${context.endDate}T23:59:59`]);
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
