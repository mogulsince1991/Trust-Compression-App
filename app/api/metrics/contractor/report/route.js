import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "../../../../../lib/supabase";
import { buildReportFromDatabaseRows, reportBreakdowns } from "../../../../../lib/metrics/contractor/dbReport.js";
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

    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
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
    const breakdowns = reportBreakdowns(report.metrics);
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

    const { data: savedReport, error: saveError } = await supabase
      .from("contractor_reports")
      .insert({
        workspace_id: workspaceId,
        rule_set_id: ruleSet.id ?? null,
        start_date: startDate,
        end_date: endDate,
        client_name: clientName,
        totals: report.metrics.totals,
        breakdowns,
        detail: {
          executiveSummary: report.executiveSummary,
          unmatched: report.unmatched,
          matchedRecords: report.detail.matchedRecords,
          attributionMatchedRecords: report.detail.attributionMatchedRecords,
          configuredMetrics,
        },
        source_snapshot: sourceSnapshot,
        rules_snapshot: ruleSet,
        generated_by: user.id,
      })
      .select("id,created_at")
      .single();

    if (saveError) throw saveError;

    const { data: savedRun, error: runError } = await supabase
      .from("contractor_report_runs")
      .insert({
        workspace_id: workspaceId,
        rule_set_id: ruleSet.id ?? null,
        contractor_report_id: savedReport.id,
        start_date: startDate,
        end_date: endDate,
        status: "completed",
        source_snapshot: sourceSnapshot,
        output_snapshot: {
          totals: report.metrics.totals,
          breakdowns,
          configuredMetrics,
        },
        rules_snapshot: ruleSet,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (runError) throw runError;

    return NextResponse.json({
      reportId: savedReport.id,
      reportRunId: savedRun.id,
      createdAt: savedReport.created_at,
      ruleSet,
      sourceSnapshot,
      totals: report.metrics.totals,
      breakdowns,
      executiveSummary: report.executiveSummary,
      configuredMetrics,
      unmatched: report.unmatched,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Contractor metrics report failed." }, { status: 400 });
  }
}

function inPeriod(value, startDate, endDate) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= new Date(`${startDate}T00:00:00`) && date <= new Date(`${endDate}T23:59:59`);
}
