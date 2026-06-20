import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "../../../../../lib/supabase";
import { buildReportFromDatabaseRows } from "../../../../../lib/metrics/contractor/dbReport.js";
import { buildConfiguredMetricResults } from "../../../../../lib/metrics/contractor/configuredMetrics";
import { getContractorRuleSet } from "../../../../../lib/server/contractor-rule-sets";
import { createServiceSupabaseClient } from "../../../../../lib/supabase";
import { toRuntimeMetricRules } from "../../../../../lib/metrics/contractor/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Sign in before generating contractor metrics." }, { status: 401 });

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

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const serviceSupabase = createServiceSupabaseClient();
    if (!serviceSupabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 500 });

    const ruleSet = await getContractorRuleSet(serviceSupabase, workspaceId, ruleSetId);
    const runtimeRules = toRuntimeMetricRules(ruleSet);

    const current = await generateReportPayload({
      supabase,
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
          supabase,
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
      const { data: insertedReport, error: saveError } = await supabase
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

      const { data: insertedRun, error: runError } = await supabase
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Contractor metrics report failed." }, { status: 400 });
  }
}

async function generateReportPayload({ supabase, workspaceId, clientName, startDate, endDate, ruleSet, runtimeRules }) {
  const [{ data: leads, error: leadsError }, { data: jobs, error: jobsError }, { data: spendRows, error: spendError }] = await Promise.all([
    supabase
      .from("contractor_leads")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("created_date", `${startDate}T00:00:00`)
      .lte("created_date", `${endDate}T23:59:59`),
    supabase
      .from("contractor_jobs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .or(`appointment_date.gte.${startDate}T00:00:00,sold_date.gte.${startDate}T00:00:00`),
    supabase
      .from("contractor_spend_rows")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("spend_date", startDate)
      .lte("spend_date", endDate),
  ]);

  if (leadsError) throw leadsError;
  if (jobsError) throw jobsError;
  if (spendError) throw spendError;

  const filteredJobs = (jobs ?? []).filter((job) => inPeriod(job.appointment_date, startDate, endDate) || inPeriod(job.sold_date, startDate, endDate));
  const report = buildReportFromDatabaseRows({
    client: clientName,
    startDate,
    endDate,
    leads: leads ?? [],
    jobs: filteredJobs,
    spendRows: spendRows ?? [],
    rules: runtimeRules,
  });

  report.runtimeRules = runtimeRules;
  const configuredMetrics = buildConfiguredMetricResults({
    ruleSet,
    report,
    startDate,
    endDate,
    leads: leads ?? [],
    jobs: filteredJobs,
    spendRows: spendRows ?? [],
  });
  const sourceSnapshot = {
    leadRows: leads?.length ?? 0,
    jobRows: filteredJobs.length,
    spendRows: spendRows?.length ?? 0,
    generatedFrom: "contractor_* normalized tables",
    ruleSetId: ruleSet.id ?? null,
    ruleSetVersion: ruleSet.version,
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
    dashboard: buildDashboardSnapshot(report),
    sourceSnapshot,
  };
}

function buildDashboardSnapshot(report) {
  return {
    paidChannelPerformance: report.metrics.byVendor ?? [],
    designConsultantPerformance: report.metrics.byDesignConsultant ?? [],
    leadsBySource: report.metrics.byLeadSource ?? [],
    jobsSoldDetail: report.metrics.jobsSoldDetail ?? [],
    closingOutcomes: report.metrics.closingOutcomes ?? [],
    unmatchedRecords: {
      leads: report.unmatched?.leads ?? [],
      jobs: report.unmatched?.jobs ?? [],
    },
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

function inPeriod(value, startDate, endDate) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= new Date(`${startDate}T00:00:00`) && date <= new Date(`${endDate}T23:59:59`);
}
