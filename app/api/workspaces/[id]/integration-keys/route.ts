import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { hashIntegrationKey } from "@/lib/server/integration-auth";
import { requireWorkspaceAccess, requireWorkspaceManager } from "@/lib/server/route-auth";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, params.id));
    const { data, error } = await context.serviceSupabase
      .from("workspace_integration_keys")
      .select("id,name,key_prefix,scopes,last_used_at,created_at,revoked_at")
      .eq("workspace_id", params.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ keys: data ?? [], mcpUrl: `${new URL(request.url).origin}/mcp` });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof (error as any).status === "number" ? (error as any).status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load integration keys." }, { status });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, params.id));
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const rawKey = `tc_live_${randomBytes(24).toString("base64url")}`;
    const payload = {
      workspace_id: params.id,
      name: body.name?.trim().slice(0, 80) || "Viktor",
      key_hash: hashIntegrationKey(rawKey),
      key_prefix: rawKey.slice(0, 16),
      scopes: ["library:import"],
      created_by: context.user.id,
    };
    const { data, error } = await context.serviceSupabase
      .from("workspace_integration_keys")
      .insert(payload)
      .select("id,name,key_prefix,scopes,last_used_at,created_at,revoked_at")
      .single();
    if (error || !data) throw error ?? new Error("Could not create the integration key.");
    return NextResponse.json({ key: data, secret: rawKey, mcpUrl: `${new URL(request.url).origin}/mcp` });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof (error as any).status === "number" ? (error as any).status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create the integration key." }, { status });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, params.id));
    const body = (await request.json()) as { keyId?: string };
    if (!body.keyId) return NextResponse.json({ error: "keyId is required." }, { status: 400 });
    const { error } = await context.serviceSupabase
      .from("workspace_integration_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("workspace_id", params.id)
      .eq("id", body.keyId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof (error as any).status === "number" ? (error as any).status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not revoke the integration key." }, { status });
  }
}

