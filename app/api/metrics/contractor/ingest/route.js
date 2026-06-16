import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "../../../../../lib/supabase";
import { normalizeJobTreadJobs, normalizeSpendRows, normalizeWindsorContacts } from "../../../../../lib/metrics/contractor/normalize.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDERS = new Set(["gohighlevel", "jobtread", "windsor", "spend_upload", "csv", "manual"]);

export async function POST(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Sign in before importing contractor metrics data." }, { status: 401 });

  try {
    const body = await request.json();
    const workspaceId = String(body.workspaceId ?? "").trim();
    const provider = String(body.provider ?? "manual").trim();
    const displayName = String(body.displayName ?? providerLabel(provider)).trim();
    const externalAccountId = clean(body.externalAccountId);

    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });
    if (!PROVIDERS.has(provider)) return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const source = await upsertSource(supabase, {
      workspaceId,
      provider,
      displayName,
      externalAccountId,
      createdBy: user.id,
      settings: body.settings && typeof body.settings === "object" ? body.settings : {},
    });

    const { data: syncRun, error: syncError } = await supabase
      .from("contractor_sync_runs")
      .insert({ workspace_id: workspaceId, data_source_id: source.id, status: "started" })
      .select("id")
      .single();
    if (syncError) throw syncError;

    const counts = { imported: 0, updated: 0, skipped: 0 };

    const leads = normalizeWindsorContacts(Array.isArray(body.leads) ? body.leads : []);
    for (const lead of leads) {
      const result = await upsertLead(supabase, workspaceId, source.id, lead);
      counts[result] += 1;
    }

    const jobs = normalizeJobTreadJobs(Array.isArray(body.jobs) ? body.jobs : []);
    for (const job of jobs) {
      const result = await upsertJob(supabase, workspaceId, source.id, job);
      counts[result] += 1;
    }

    const spendRows = normalizeSpendRows(Array.isArray(body.spendRows) ? body.spendRows : []);
    if (spendRows.length) {
      const rows = spendRows.map((row) => ({
        workspace_id: workspaceId,
        data_source_id: source.id,
        spend_date: row.date || null,
        vendor: row.vendor,
        channel: row.channel || null,
        campaign: row.campaign || null,
        spend: row.spend,
        leads: row.leads || 0,
        trackable: row.trackable !== false,
        source_file: row.sourceFile || null,
        raw: row,
      }));
      const { error } = await supabase.from("contractor_spend_rows").insert(rows);
      if (error) throw error;
      counts.imported += rows.length;
    }

    await supabase
      .from("contractor_sync_runs")
      .update({
        status: "success",
        imported_count: counts.imported,
        updated_count: counts.updated,
        skipped_count: counts.skipped,
        finished_at: new Date().toISOString(),
      })
      .eq("id", syncRun.id);

    await supabase
      .from("contractor_data_sources")
      .update({ status: "connected", last_synced_at: new Date().toISOString() })
      .eq("id", source.id);

    return NextResponse.json({ sourceId: source.id, syncRunId: syncRun.id, ...counts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Contractor metrics ingest failed." }, { status: 400 });
  }
}

async function upsertSource(supabase, { workspaceId, provider, displayName, externalAccountId, createdBy, settings }) {
  let existing = null;
  if (externalAccountId) {
    const { data } = await supabase
      .from("contractor_data_sources")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("provider", provider)
      .eq("external_account_id", externalAccountId)
      .maybeSingle();
    existing = data;
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from("contractor_data_sources")
      .update({ display_name: displayName, settings, status: "syncing" })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("contractor_data_sources")
    .insert({
      workspace_id: workspaceId,
      provider,
      display_name: displayName,
      external_account_id: externalAccountId,
      settings,
      status: "syncing",
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

async function upsertLead(supabase, workspaceId, sourceId, lead) {
  const externalId = clean(lead.rawRef || lead.id);
  if (!externalId) return "skipped";

  const payload = {
    workspace_id: workspaceId,
    data_source_id: sourceId,
    external_id: externalId,
    name: lead.name || null,
    email: lead.email || null,
    phone: lead.phone || null,
    source: lead.source || null,
    campaign: lead.campaign || null,
    created_date: lead.createdDate || null,
    tags: tagsArray(lead.tags),
    notes_summary: lead.notesSummary || null,
    raw: lead,
  };

  const { data: existing } = await supabase
    .from("contractor_leads")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("data_source_id", sourceId)
    .eq("external_id", externalId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("contractor_leads").update(payload).eq("id", existing.id);
    if (error) throw error;
    return "updated";
  }

  const { error } = await supabase.from("contractor_leads").insert(payload);
  if (error) throw error;
  return "imported";
}

async function upsertJob(supabase, workspaceId, sourceId, job) {
  const externalId = clean(job.rawRef || job.jobId || job.id || job.jobNumber);
  if (!externalId) return "skipped";

  const payload = {
    workspace_id: workspaceId,
    data_source_id: sourceId,
    external_id: externalId,
    job_number: job.jobNumber || null,
    customer: job.customer || null,
    email: job.email || null,
    phone: job.phone || null,
    appointment_date: job.appointmentDate || null,
    sold_date: job.soldDate || null,
    status: job.status || null,
    project_type: job.projectType || null,
    revenue: job.revenue || 0,
    net_sales: job.netSales || job.revenue || 0,
    design_consultant: job.designConsultant || null,
    project_manager: job.projectManager || null,
    source: job.source || null,
    campaign: job.campaign || null,
    notes_summary: job.notesSummary || null,
    raw: job,
  };

  const { data: existing } = await supabase
    .from("contractor_jobs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("data_source_id", sourceId)
    .eq("external_id", externalId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("contractor_jobs").update(payload).eq("id", existing.id);
    if (error) throw error;
    return "updated";
  }

  const { error } = await supabase.from("contractor_jobs").insert(payload);
  if (error) throw error;
  return "imported";
}

function clean(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function tagsArray(value) {
  if (Array.isArray(value)) return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  return String(value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function providerLabel(provider) {
  if (provider === "gohighlevel") return "GoHighLevel";
  if (provider === "jobtread") return "JobTread";
  if (provider === "spend_upload") return "Spend upload";
  return "Contractor metrics source";
}
