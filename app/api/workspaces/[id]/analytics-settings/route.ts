import { NextResponse } from "next/server";
import { isIP } from "node:net";
import { requireWorkspaceAccess, requireWorkspaceManager } from "@/lib/server/route-auth";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await requireWorkspaceAccess(request, params.id);
    const { data, error } = await context.serviceSupabase.from("workspaces").select("settings").eq("id", params.id).single();
    if (error) throw error;
    return NextResponse.json({ excludedIps: data.settings?.analyticsExcludedIps || [] });
  } catch { return NextResponse.json({ error: "Could not load analytics settings." }, { status: 403 }); }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, params.id));
    const body = await request.json();
    if (!Array.isArray(body.excludedIps) || body.excludedIps.length > 30 || body.excludedIps.some((ip: unknown) => typeof ip !== "string" || !isIP(ip))) return NextResponse.json({ error: "Enter up to 30 valid IP addresses (not ranges)." }, { status: 400 });
    const { data, error } = await context.serviceSupabase.from("workspaces").select("settings").eq("id", params.id).single();
    if (error) throw error;
    const { error: updateError } = await context.serviceSupabase.from("workspaces").update({ settings: { ...data.settings, analyticsExcludedIps: Array.from(new Set(body.excludedIps)) } }).eq("id", params.id);
    if (updateError) throw updateError;
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Only workspace managers can change these settings." }, { status: 403 }); }
}
