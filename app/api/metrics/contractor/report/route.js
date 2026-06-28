import { NextResponse } from "next/server";
import { fetchGoHighLevelSnapshot } from "../../../../../lib/integrations/contractor/gohighlevel";
import { fetchJobTreadSnapshot } from "../../../../../lib/integrations/contractor/jobtread";
import {
  buildConfiguredDashboard,
  buildConfiguredMetricResults,
  buildMetricEvaluationContext,
} from "../../../../../lib/metrics/contractor/configuredMetrics";
import { buildReport } from "../../../../../lib/metrics/contractor/report.js";
import { getContractorRuleSet } from "../../../../../lib/server/contractor-rule-sets";
import { toRuntimeMetricRules } from "../../../../../lib/metrics/contractor/config";
import { requireWorkspaceAccess } from "../../../../../lib/server/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const workspaceId = String(body.workspaceId ?? "").trim();
    const startDate = String(body.startDate ?? "").trim();
    const endDate = String(body.endDate ?? "").trim();
    const clientName = String(body.clientName ?? "Contractor").trim();
    const ruleSetId = String(body.ruleSetId ?? "").trim() || null;
    const compareToPreviousPeriod = body.compareToPreviousPeriod !== false;
    const persist = body.persist !== false;

    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      return NextResponse.json({ error: "startDate and endDate must use YYYY-MM-DD." }, { status: 400 });
    }

    const { user, userSupabase, serviceSupabase } = await requireWorkspaceAccess(request, workspaceId);
    const ruleSet = await getContractorRuleSet(serviceSupabase, workspaceId, ruleSetId);
    const runtimeRules = toRuntimeMetricRules(ruleSet);

    const current = await generateReportPayload({
      userSupabase,
      serviceSupabase,
      workspaceId,
      clientName,
      startDate,
      endDate,
      ruleSet,
      runtimeRules,
    });

    const comparisonRange = compareToPreviousPeriod ? previousPeriodRange(startDate, endDate) : null;
    const comparison = comparisonRange
      ? await generateReportPayload({
          userSupabase,
          serviceSupabase,
          workspaceId,
          clientName,
          startDate: comparisonRange.startDate,
          endDate: comparisonRange.endDate,
          ruleSet,
          runtimeRules,
        })
      : null;

    let savedReport = null;
    let savedRun = null;

    if (persist) {
      const { data: insertedReport, error: saveError } = await userSupabase
        .from("contractor_reports")
        .insert({
          workspace_id: workspaceId,
          rule_set_id: ruleSet.id ?? null,
          start_date: startDate,
          end_date: endDate,
          client_name: clientName,
          totals: current.totals,
          breakdowns: current.breakdowns,
          detail: {
            executiveSummary: current.executiveSummary,
            unmatched: current.unmatched,
            matchedRecords: current.detail.matchedRecords,
            attributionMatchedRecords: current.detail.attributionMatchedRecords,
            debug: current.debug,
            configuredMetrics: current.configuredMetrics,
            dashboard: current.dashboard,
            comparison: comparison
              ? {
                  startDate: comparisonRange.startDate,
                  endDate: comparisonRange.endDate,
                  totals: comparison.totals,
                  configuredMetrics: comparison.configuredMetrics,
                }
              : null,
          },
          source_snapshot: current.sourceSnapshot,
          rules_snapshot: ruleSet,
          generated_by: user.id,
        })
        .select("id,created_at")
        .single();

      if (saveError) throw saveError;
      savedReport = insertedReport;

      const { data: insertedRun, error: runError } = await userSupabase
        .from("contractor_report_runs")
        .insert({
          workspace_id: workspaceId,
          rule_set_id: ruleSet.id ?? null,
          contractor_report_id: savedReport.id,
          start_date: startDate,
          end_date: endDate,
          status: "completed",
          source_snapshot: current.sourceSnapshot,
          output_snapshot: {
            totals: current.totals,
            breakdowns: current.breakdowns,
            configuredMetrics: current.configuredMetrics,
            dashboard: current.dashboard,
          },
          rules_snapshot: ruleSet,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (runError) throw runError;
      savedRun = insertedRun;
    }

    return NextResponse.json({
      reportId: savedReport?.id ?? null,
      reportRunId: savedRun?.id ?? null,
      createdAt: savedReport?.created_at ?? new Date().toISOString(),
      ruleSet,
      sourceSnapshot: current.sourceSnapshot,
      totals: current.totals,
      breakdowns: current.breakdowns,
      executiveSummary: current.executiveSummary,
      configuredMetrics: current.configuredMetrics,
      unmatched: current.unmatched,
      dashboard: current.dashboard,
      debug: current.debug,
      comparison: comparison
        ? {
            label: "Previous period",
            startDate: comparisonRange.startDate,
            endDate: comparisonRange.endDate,
            totals: comparison.totals,
            configuredMetrics: comparison.configuredMetrics,
          }
        : null,
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Contractor metrics report failed." }, { status });
  }
}

async function generateReportPayload({ userSupabase, serviceSupabase, workspaceId, clientName, startDate, endDate, ruleSet, runtimeRules }) {
  const [{ data: spendRows, error: spendError }, { data: connectedAccounts, error: accountsError }] = await Promise.all([
    userSupabase
      .from("contractor_spend_rows")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("spend_date", startDate)
      .lte("spend_date", endDate),
    serviceSupabase
      .from("connected_accounts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "connected")
      .in("provider", ["ghl", "gohighlevel", "jobtread"]),
  ]);

  if (accountsError) throw accountsError;
  if (spendError) throw spendError;

  const liveSnapshots = await Promise.all(
    (connectedAccounts ?? []).map(async (account) => {
      if (account.provider === "ghl" || account.provider === "gohighlevel") {
        const accountLabel = account.account_label ?? "GoHighLevel";
        try {
          return {
            provider: "gohighlevel",
            accountLabel,
            snapshot: await fetchChunkedGoHighLevelSnapshot(account, {
              startDate,
              endDate,
              timeZone: runtimeRules?.timezone,
            }),
            error: null,
          };
        } catch (error) {
          return {
            provider: "gohighlevel",
            accountLabel,
            snapshot: null,
            error: error instanceof Error ? error.message : "GoHighLevel contact sync failed.",
          };
        }
      }

      if (account.provider === "jobtread") {
        const accountLabel = account.account_label ?? "JobTread";
        try {
          return {
            provider: "jobtread",
            accountLabel,
            snapshot: await fetchChunkedJobTreadSnapshot(account, {
              startDate,
              endDate,
              timeZone: runtimeRules?.timezone,
            }),
            error: null,
          };
        } catch (error) {
          return {
            provider: "jobtread",
            accountLabel,
            snapshot: null,
            error: error instanceof Error ? error.message : "JobTread sync failed.",
          };
        }
      }

      return null;
    })
  );

  const liveLeads = [];
  const liveJobs = [];

  for (const entry of liveSnapshots) {
    if (!entry?.snapshot) continue;
    liveLeads.push(...(entry.snapshot.leads ?? []));
    liveJobs.push(...(entry.snapshot.jobs ?? []));
  }

  const report = buildReport({
    client: clientName,
    startDate,
    endDate,
    allowArchivedSpend: false,
    rules: runtimeRules,
    uploadedSpendRows: (spendRows ?? []).map(toUploadedSpendRow),
    windsorRows: liveLeads,
    attributionRows: liveLeads,
    jobtreadRows: liveJobs,
  });

  report.runtimeRules = runtimeRules;
  const metricContext = buildMetricEvaluationContext({
    report,
    startDate,
    endDate,
    leads: liveLeads.map(toConfiguredLeadRow),
    jobs: liveJobs.map(toConfiguredJobRow),
    spendRows: spendRows ?? [],
  });
  const configuredMetrics = buildConfiguredMetricResults({
    ruleSet,
    report,
    startDate,
    endDate,
    leads: liveLeads.map(toConfiguredLeadRow),
    jobs: liveJobs.map(toConfiguredJobRow),
    spendRows: spendRows ?? [],
  });
  const snapshotSources = liveSnapshots
    .filter((entry) => entry?.snapshot)
    .map((entry) => `${entry.accountLabel} (${entry.provider})`);
  const accountErrors = liveSnapshots
    .filter((entry) => entry?.error)
    .map((entry) => `${entry.accountLabel} (${entry.provider}): ${entry.error}`);
  const sourceSnapshot = {
    leadRows: liveLeads.length,
    jobRows: liveJobs.length,
    spendRows: spendRows?.length ?? 0,
    generatedFrom: snapshotSources.length
      ? `live connected accounts: ${snapshotSources.join(", ")}${spendRows?.length ? " + stored spend rows" : ""}`
      : "stored spend rows only",
    ruleSetId: ruleSet.id ?? null,
    ruleSetVersion: ruleSet.version,
    liveConnectedAccounts: snapshotSources,
    accountErrors,
  };

  return {
    totals: report.metrics.totals,
    breakdowns: {
      spend: report.metrics.spend,
      byVendor: report.metrics.byVendor,
      byCampaign: report.metrics.byCampaign,
      byDesignConsultant: report.metrics.byDesignConsultant,
      byLeadSource: report.metrics.byLeadSource,
      closingOutcomes: report.metrics.closingOutcomes,
      jobsSoldDetail: report.metrics.jobsSoldDetail,
    },
    executiveSummary: report.executiveSummary,
    configuredMetrics,
    unmatched: report.unmatched,
    detail: report.detail,
    dashboard: buildConfiguredDashboard({ ruleSet, report, context: metricContext }),
    debug: buildDebugPayload({ liveLeads, liveJobs, spendRows: spendRows ?? [], report }),
    sourceSnapshot,
  };
}

function buildDebugPayload({ liveLeads, liveJobs, spendRows, report }) {
  return {
    tables: [
      {
        id: "gohighlevel_contacts",
        title: "GoHighLevel Contacts",
        description: "Live contact rows returned for this report window before matching.",
        rows: limitDebugRows(
          liveLeads.map((row) => ({
            id: row.id ?? null,
            name: row.name ?? null,
            email: row.email ?? null,
            phone: row.phone ?? null,
            source: row.source ?? null,
            campaign: row.campaign ?? null,
            createdDate: row.createdDate ?? null,
            tags: row.tags ?? [],
          }))
        ),
        columns: [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "source", label: "Source" },
          { key: "campaign", label: "Campaign" },
          { key: "createdDate", label: "Created" },
          { key: "tags", label: "Tags" },
        ],
        totalRows: liveLeads.length,
      },
      {
        id: "jobtread_jobs",
        title: "JobTread Jobs",
        description: "Live job rows returned for this report window before sold-job filtering.",
        rows: limitDebugRows(
          liveJobs.map((row) => ({
            jobId: row.jobId ?? row.id ?? null,
            jobNumber: row.jobNumber ?? null,
            customer: row.customer ?? null,
            soldDate: row.soldDate ?? null,
            soldDateSource: row.soldDateSource ?? null,
            appointmentDate: row.appointmentDate ?? row.createdAt ?? null,
            status: row.status ?? null,
            revenue: row.revenue ?? 0,
            source: row.source ?? null,
            campaign: row.campaign ?? null,
            designConsultant: row.designConsultant ?? null,
            projectManager: row.projectManager ?? null,
            overrideReason: row.overrideReason ?? null,
          }))
        ),
        columns: [
          { key: "jobId", label: "Job ID" },
          { key: "jobNumber", label: "Job #" },
          { key: "customer", label: "Customer" },
          { key: "soldDate", label: "Sold Date" },
          { key: "soldDateSource", label: "Sold Date Source" },
          { key: "appointmentDate", label: "Appointment / Created" },
          { key: "status", label: "Status" },
          { key: "revenue", label: "Revenue", format: "currency" },
          { key: "source", label: "Source" },
          { key: "campaign", label: "Campaign" },
          { key: "designConsultant", label: "Design Consultant" },
          { key: "projectManager", label: "Project Manager" },
          { key: "overrideReason", label: "Override Reason" },
        ],
        totalRows: liveJobs.length,
      },
      {
        id: "sold_jobs_used",
        title: "Sold Jobs Used",
        description: "The sold-job rows currently powering sold-job and revenue metrics.",
        rows: limitDebugRows(report.metrics.jobsSoldDetail ?? []),
        columns: [
          { key: "jobId", label: "Job ID" },
          { key: "customer", label: "Customer" },
          { key: "projectType", label: "Project Type" },
          { key: "soldDate", label: "Sold Date" },
          { key: "leadCreatedEastern", label: "Lead Created (ET)" },
          { key: "timeToClose", label: "Time to Close" },
          { key: "attributedSource", label: "Attributed Source" },
          { key: "sourceBucket", label: "Bucket" },
          { key: "designConsultant", label: "Design Consultant" },
          { key: "projectManager", label: "Project Manager" },
          { key: "revenue", label: "Revenue", format: "currency" },
        ],
        totalRows: report.metrics.jobsSoldDetail?.length ?? 0,
      },
      {
        id: "matched_records",
        title: "Matched Records",
        description: "Lead-to-job matches used for appointments and attribution stitching.",
        rows: limitDebugRows(report.detail?.matchedRecords ?? []),
        columns: [
          { key: "matchKey", label: "Match Key" },
          { key: "leadId", label: "Lead ID" },
          { key: "jobId", label: "Job ID" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "source", label: "Source" },
          { key: "campaign", label: "Campaign" },
          { key: "soldDate", label: "Sold Date" },
          { key: "revenue", label: "Revenue", format: "currency" },
          { key: "designConsultant", label: "Design Consultant" },
        ],
        totalRows: report.detail?.matchedRecords?.length ?? 0,
      },
      {
        id: "attribution_matches",
        title: "Attributed Sold Matches",
        description: "Attributed matches used when source attribution is carried onto sold jobs.",
        rows: limitDebugRows(report.detail?.attributionMatchedRecords ?? []),
        columns: [
          { key: "matchKey", label: "Match Key" },
          { key: "leadId", label: "Lead ID" },
          { key: "jobId", label: "Job ID" },
          { key: "name", label: "Name" },
          { key: "source", label: "Source" },
          { key: "campaign", label: "Campaign" },
          { key: "soldDate", label: "Sold Date" },
          { key: "revenue", label: "Revenue", format: "currency" },
        ],
        totalRows: report.detail?.attributionMatchedRecords?.length ?? 0,
      },
      {
        id: "spend_rows",
        title: "Spend Rows",
        description: "Marketing spend rows included inside the selected date window.",
        rows: limitDebugRows(
          spendRows.map((row) => ({
            spendDate: row.spend_date ?? null,
            vendor: row.vendor ?? null,
            channel: row.channel ?? null,
            campaign: row.campaign ?? null,
            spend: row.spend ?? 0,
            leads: row.leads ?? 0,
            sourceFile: row.source_file ?? null,
          }))
        ),
        columns: [
          { key: "spendDate", label: "Spend Date" },
          { key: "vendor", label: "Vendor" },
          { key: "channel", label: "Channel" },
          { key: "campaign", label: "Campaign" },
          { key: "spend", label: "Spend", format: "currency" },
          { key: "leads", label: "Leads" },
          { key: "sourceFile", label: "Source File" },
        ],
        totalRows: spendRows.length,
      },
      {
        id: "unmatched_leads",
        title: "Unmatched Leads",
        description: "Lead rows that did not match a JobTread job.",
        rows: limitDebugRows(
          (report.unmatched?.leads ?? []).map((row) => ({
            id: row.id ?? null,
            name: row.name ?? null,
            email: row.email ?? null,
            phone: row.phone ?? null,
            source: row.source ?? null,
            campaign: row.campaign ?? null,
            reason: row.reason ?? "Not matched",
          }))
        ),
        columns: [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "source", label: "Source" },
          { key: "campaign", label: "Campaign" },
          { key: "reason", label: "Reason" },
        ],
        totalRows: report.unmatched?.leads?.length ?? 0,
      },
      {
        id: "unmatched_jobs",
        title: "Unmatched Jobs",
        description: "Job rows that did not match a lead/contact row.",
        rows: limitDebugRows(
          (report.unmatched?.jobs ?? []).map((row) => ({
            jobId: row.jobId ?? row.id ?? null,
            jobNumber: row.jobNumber ?? null,
            customer: row.customer ?? null,
            soldDate: row.soldDate ?? null,
            status: row.status ?? null,
            revenue: row.revenue ?? 0,
            source: row.source ?? null,
            reason: row.reason ?? "Not matched",
          }))
        ),
        columns: [
          { key: "jobId", label: "Job ID" },
          { key: "jobNumber", label: "Job #" },
          { key: "customer", label: "Customer" },
          { key: "soldDate", label: "Sold Date" },
          { key: "status", label: "Status" },
          { key: "revenue", label: "Revenue", format: "currency" },
          { key: "source", label: "Source" },
          { key: "reason", label: "Reason" },
        ],
        totalRows: report.unmatched?.jobs?.length ?? 0,
      },
    ],
  };
}

function limitDebugRows(rows, limit = 250) {
  return Array.isArray(rows) ? rows.slice(0, limit) : [];
}

function toUploadedSpendRow(row) {
  return {
    Date: row.spend_date,
    Vendor: row.vendor,
    Channel: row.channel,
    Campaign: row.campaign,
    Spend: row.spend,
    Leads: row.leads,
    trackable: row.trackable,
    sourceFile: row.source_file,
  };
}

async function fetchChunkedGoHighLevelSnapshot(account, { startDate, endDate, timeZone }) {
  const windows = splitDateRangeIntoMonthlyWindows(startDate, endDate);
  const leads = [];
  let settings = null;
  let displayName = account.account_label ?? "GoHighLevel";
  let externalAccountId = null;

  for (const window of windows) {
    const snapshot = await fetchGoHighLevelSnapshotWithFallback(account, { ...window, timeZone });
    displayName = snapshot.displayName ?? displayName;
    externalAccountId = snapshot.externalAccountId ?? externalAccountId;
    settings = snapshot.settings ?? settings;
    leads.push(...(snapshot.leads ?? []));
  }

  return {
    displayName,
    externalAccountId,
    leads: dedupeRows(leads, (row) => row.id ?? `${row.email ?? ""}:${row.phone ?? ""}:${row.createdDate ?? ""}`),
    jobs: [],
    spendRows: [],
    settings,
  };
}

async function fetchChunkedJobTreadSnapshot(account, { startDate, endDate, timeZone }) {
  const fetchBounds = recommendJobTreadFetchBounds(startDate, endDate);
  const snapshot = await fetchJobTreadSnapshot(account, {
    startDate,
    endDate,
    timeZone,
    limit: fetchBounds.limit,
    maxPages: fetchBounds.maxPages,
    filterToWindow: true,
  });

  return {
    displayName: snapshot.displayName ?? account.account_label ?? "JobTread",
    externalAccountId: snapshot.externalAccountId ?? null,
    leads: [],
    jobs: dedupeRows(snapshot.jobs ?? [], (row) => row.jobId ?? row.id ?? row.jobNumber),
    spendRows: [],
    settings: snapshot.settings ?? null,
  };
}

function recommendJobTreadFetchBounds(startDate, endDate) {
  const totalDays = inclusiveDayCount(startDate, endDate);

  if (totalDays <= 45) {
    return { limit: 1500, maxPages: 15 };
  }
  if (totalDays <= 120) {
    return { limit: 3000, maxPages: 30 };
  }
  if (totalDays <= 370) {
    return { limit: 6000, maxPages: 60 };
  }
  return { limit: 9000, maxPages: 90 };
}

async function fetchGoHighLevelSnapshotWithFallback(account, { startDate, endDate, timeZone }) {
  try {
    return await fetchGoHighLevelSnapshot(account, {
      startDate,
      endDate,
      timeZone,
      limit: 1000,
      scanLimit: 2000,
      maxPages: 20,
    });
  } catch (primaryError) {
    return await fetchGoHighLevelSnapshot(account, {
      startDate,
      endDate,
      timeZone,
      limit: 500,
      scanLimit: 1000,
      maxPages: 10,
    });
  }
}

function splitDateRangeIntoMonthlyWindows(startDate, endDate) {
  const windows = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));

  while (cursor <= end) {
    const windowStart = cursor < start ? start : cursor;
    const windowEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const boundedEnd = windowEnd > end ? end : windowEnd;
    windows.push({
      startDate: toIsoDate(windowStart),
      endDate: toIsoDate(boundedEnd),
    });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return windows;
}

function dedupeRows(rows, keyFn) {
  const deduped = [];
  const seen = new Set();

  for (const row of rows) {
    const key = keyFn(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

function toConfiguredLeadRow(row) {
  return {
    external_id: row.id ?? null,
    name: row.name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    source: row.source ?? null,
    campaign: row.campaign ?? null,
    created_date: row.createdDate ?? null,
    tags: row.tags ?? null,
    notes_summary: row.notesSummary ?? null,
  };
}

function toConfiguredJobRow(row) {
  return {
    external_id: row.jobId ?? row.id ?? null,
    job_number: row.jobNumber ?? null,
    customer: row.customer ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    appointment_date: row.appointmentDate ?? row.createdAt ?? null,
    sold_date: row.soldDate ?? null,
    status: row.status ?? null,
    project_type: row.projectType ?? null,
    revenue: row.revenue ?? 0,
    net_sales: row.netSales ?? row.revenue ?? 0,
    design_consultant: row.designConsultant ?? null,
    project_manager: row.projectManager ?? null,
    source: row.source ?? null,
    campaign: row.campaign ?? null,
    notes_summary: row.notesSummary ?? null,
  };
}

function previousPeriodRange(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const previousEnd = new Date(start.getTime() - 86400000);
  const previousStart = new Date(previousEnd.getTime() - (dayCount - 1) * 86400000);
  return {
    startDate: toIsoDate(previousStart),
    endDate: toIsoDate(previousEnd),
  };
}

function inclusiveDayCount(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function toIsoDate(value) {
  return value.toISOString().slice(0, 10);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
