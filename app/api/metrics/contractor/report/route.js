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
        return {
          provider: "gohighlevel",
          accountLabel: account.account_label ?? "GoHighLevel",
          snapshot: await fetchGoHighLevelSnapshot(account, {
            startDate,
            endDate,
            limit: 5000,
            scanLimit: 10000,
            maxPages: 100,
          }),
        };
      }

      if (account.provider === "jobtread") {
        return {
          provider: "jobtread",
          accountLabel: account.account_label ?? "JobTread",
          snapshot: await fetchJobTreadSnapshot(account, { startDate, endDate, limit: 1000 }),
        };
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
    .filter(Boolean)
    .map((entry) => `${entry.accountLabel} (${entry.provider})`);
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
    sourceSnapshot,
  };
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

function toIsoDate(value) {
  return value.toISOString().slice(0, 10);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
