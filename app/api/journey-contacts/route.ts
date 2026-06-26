import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";

type JourneyContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  company: string | null;
  phone: string | null;
  crmSource: string | null;
  externalId: string | null;
  sourceLabel: string | null;
  detailLabel: string | null;
  contactRecordId: string | null;
  status: string | null;
  soldDate: string | null;
};

export async function GET(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in before browsing contacts." }, { status: 401 });

    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const [contactsResult, leadsResult, jobsResult] = await Promise.all([
      supabase
        .from("contacts")
        .select("id,name,email,company,phone,crm_source,external_id,updated_at")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false })
        .limit(160),
      supabase
        .from("contractor_leads")
        .select("external_id,name,email,phone,source,campaign,created_date")
        .eq("workspace_id", workspaceId)
        .order("created_date", { ascending: false })
        .limit(160),
      supabase
        .from("contractor_jobs")
        .select("external_id,customer,email,phone,source,status,sold_date,project_type,design_consultant,appointment_date,created_at")
        .eq("workspace_id", workspaceId)
        .order("sold_date", { ascending: false, nullsFirst: false })
        .order("appointment_date", { ascending: false, nullsFirst: false })
        .limit(160)
    ]);

    if (contactsResult.error) return NextResponse.json({ error: contactsResult.error.message }, { status: 500 });
    if (leadsResult.error) return NextResponse.json({ error: leadsResult.error.message }, { status: 500 });
    if (jobsResult.error) return NextResponse.json({ error: jobsResult.error.message }, { status: 500 });

    const seen = new Set<string>();
    const rows: JourneyContactRow[] = [];

    const addRow = (row: JourneyContactRow) => {
      const dedupeKey =
        (row.contactRecordId && `contact:${row.contactRecordId}`) ||
        (row.crmSource && row.externalId && `crm:${row.crmSource}:${row.externalId}`) ||
        (row.email && `email:${row.email.toLowerCase()}`) ||
        (row.phone && `phone:${row.phone}`) ||
        `name:${row.name ?? "unknown"}:${row.id}`;

      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      rows.push(row);
    };

    for (const row of contactsResult.data ?? []) {
      addRow({
        id: String(row.id),
        contactRecordId: String(row.id),
        name: row.name ?? null,
        email: row.email ?? null,
        company: row.company ?? null,
        phone: row.phone ?? null,
        crmSource: row.crm_source ?? null,
        externalId: row.external_id ?? null,
        sourceLabel: row.crm_source ? formatCrmLabel(row.crm_source) : "Saved contact",
        detailLabel: row.company ?? row.email ?? row.phone ?? "Saved contact",
        status: null,
        soldDate: null
      });
    }

    for (const row of leadsResult.data ?? []) {
      addRow({
        id: `gohighlevel:${row.external_id ?? row.email ?? row.phone ?? row.name ?? crypto.randomUUID()}`,
        contactRecordId: null,
        name: row.name ?? null,
        email: row.email ?? null,
        company: row.source ?? null,
        phone: row.phone ?? null,
        crmSource: "gohighlevel",
        externalId: row.external_id ?? null,
        sourceLabel: "GoHighLevel lead",
        detailLabel: row.campaign ?? row.source ?? "CRM lead",
        status: null,
        soldDate: null
      });
    }

    for (const row of jobsResult.data ?? []) {
      addRow({
        id: `jobtread:${row.external_id ?? row.email ?? row.phone ?? row.customer ?? crypto.randomUUID()}`,
        contactRecordId: null,
        name: row.customer ?? null,
        email: row.email ?? null,
        company: row.project_type ?? null,
        phone: row.phone ?? null,
        crmSource: "jobtread",
        externalId: row.external_id ?? null,
        sourceLabel: "JobTread job",
        detailLabel: [row.project_type, row.design_consultant].filter(Boolean).join(" / ") || "CRM job",
        status: row.status ?? null,
        soldDate: row.sold_date ?? null
      });
    }

    return NextResponse.json({ contacts: rows.slice(0, 240) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load journey contacts." }, { status: 400 });
  }
}

function formatCrmLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "gohighlevel") return "GoHighLevel";
  if (normalized === "jobtread") return "JobTread";
  if (normalized === "manual") return "Saved contact";
  return value;
}
