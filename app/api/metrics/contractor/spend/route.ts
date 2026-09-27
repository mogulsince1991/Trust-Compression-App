import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireWorkspaceAccess, requireWorkspaceManager } from "@/lib/server/route-auth";
import { monthBounds, validateSpendRows } from "@/lib/metrics/contractor/spend-input";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const workspaceId = params.get("workspaceId") ?? "";
    const period = params.get("month") === "all" ? null : monthBounds(params.get("month") ?? "");
    const context = await requireWorkspaceAccess(request, workspaceId);
    const rows: any[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = context.userSupabase.from("contractor_spend_rows").select("id,spend_date,vendor,channel,campaign,spend,source_file,raw").eq("workspace_id", workspaceId);
      if (period) query = query.gte("spend_date", period.start).lte("spend_date", period.end);
      const { data, error } = await query.order("spend_date").order("id").range(offset, offset + 499);
      if (error) throw error;
      rows.push(...(data ?? [])); if (!data || data.length < 500) break;
    }
    return NextResponse.json({ rows, canEdit: ["owner", "admin"].includes(context.workspaceRole) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, String(body.workspaceId ?? "")));
    const rows = validateSpendRows(body.rows, String(body.month ?? ""));
    const documentName = String(body.documentName ?? "Manual entry").trim().slice(0, 200);
    // An identical import has identical row IDs, including repeated line items.
    const batch = JSON.stringify([body.workspaceId, body.month, documentName, rows]);
    const payload = rows.map((row, index) => {
      const hash = createHash("sha256").update(`${batch}:${index}`).digest("hex");
      const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
      return { id, workspace_id: body.workspaceId, spend_date: row.date, vendor: row.vendor, channel: row.channel, campaign: row.campaign, spend: row.spend, source_file: row.sourceFile || null, raw: { documentName, month: body.month } };
    });
    const { data, error } = await context.userSupabase.from("contractor_spend_rows").upsert(payload, { onConflict: "id", ignoreDuplicates: true }).select("id");
    if (error) throw error;
    return NextResponse.json({ added: data?.length ?? 0, skipped: rows.length - (data?.length ?? 0) });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, String(body.workspaceId ?? "")));
    const { data, error } = await context.userSupabase.from("contractor_spend_rows").delete().eq("workspace_id", body.workspaceId).eq("id", String(body.id ?? "")).select("id");
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ error: "This entry no longer exists or is not accessible." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, String(body.workspaceId ?? "")));
    const [row] = validateSpendRows([body.row], String(body.row?.date ?? "").slice(0, 7));
    const { data, error } = await context.userSupabase.from("contractor_spend_rows").update({
      spend_date: row.date, vendor: row.vendor, channel: row.channel || null, campaign: row.campaign || null, spend: row.spend, source_file: row.sourceFile || null,
    }).eq("workspace_id", body.workspaceId).eq("id", String(body.id ?? "")).select("id");
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ error: "This entry no longer exists or is not accessible." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}

function failure(error: any) { return NextResponse.json({ error: error?.message ?? "Could not update marketing spend." }, { status: error?.status ?? 400 }); }
