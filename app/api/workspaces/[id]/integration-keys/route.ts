import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { hashIntegrationKey } from "@/lib/server/integration-auth";
import { requireWorkspaceAccess, requireWorkspaceManager } from "@/lib/server/route-auth";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, params.id));
    const { data: routes, error: routesError } = await context.serviceSupabase
      .from("workspace_integration_sender_routes")
      .select("integration_key_id,phone_number")
      .eq("workspace_id", params.id);
    if (routesError) throw routesError;
    const linkedIds = Array.from(new Set((routes ?? []).map((route) => route.integration_key_id)));
    const { data: owned, error } = await context.serviceSupabase
      .from("workspace_integration_keys")
      .select("id,workspace_id,name,key_prefix,scopes,allowed_phone_numbers,require_direct_message,last_used_at,created_at,revoked_at")
      .eq("workspace_id", params.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    let linked: any[] = [];
    if (linkedIds.length) {
      const linkedResult = await context.serviceSupabase.from("workspace_integration_keys").select("id,workspace_id,name,key_prefix,scopes,allowed_phone_numbers,require_direct_message,last_used_at,created_at,revoked_at").in("id", linkedIds).is("revoked_at", null);
      if (linkedResult.error) throw linkedResult.error;
      linked = linkedResult.data ?? [];
    }
    const keys = Array.from(new Map([...(owned ?? []), ...linked].map((key) => [key.id, { ...key, is_owner: key.workspace_id === params.id, allowed_phone_numbers: (routes ?? []).filter((route) => route.integration_key_id === key.id).map((route) => route.phone_number) }])).values());
    return NextResponse.json({ keys, mcpUrl: `${new URL(request.url).origin}/mcp` });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof (error as any).status === "number" ? (error as any).status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load integration keys." }, { status });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, params.id));
    const body = (await request.json().catch(() => ({}))) as { name?: string; allowedPhoneNumbers?: string[]; connectorId?: string };
    const allowedPhoneNumbers = normalizePhoneList(body.allowedPhoneNumbers);
    if (!allowedPhoneNumbers.length) return NextResponse.json({ error: "Add at least one valid sender phone number." }, { status: 400 });
    if (body.connectorId) {
      const { data: connector, error: connectorError } = await context.serviceSupabase.from("workspace_integration_keys").select("id,name,key_prefix,scopes,require_direct_message,last_used_at,created_at,revoked_at").eq("id", body.connectorId).is("revoked_at", null).maybeSingle();
      if (connectorError) throw connectorError;
      if (!connector) return NextResponse.json({ error: "That connector was not found or has been revoked." }, { status: 404 });
      const { error: routeError } = await context.serviceSupabase.from("workspace_integration_sender_routes").upsert(allowedPhoneNumbers.map((phone) => ({ integration_key_id: connector.id, workspace_id: params.id, phone_number: phone, created_by: context.user.id })), { onConflict: "integration_key_id,workspace_id,phone_number" });
      if (routeError) throw routeError;
      return NextResponse.json({ key: { ...connector, is_owner: false, allowed_phone_numbers: allowedPhoneNumbers }, mcpUrl: `${new URL(request.url).origin}/mcp` });
    }
    const rawKey = `tc_live_${randomBytes(24).toString("base64url")}`;
    const payload = {
      workspace_id: params.id,
      name: body.name?.trim().slice(0, 80) || "Viktor",
      key_hash: hashIntegrationKey(rawKey),
      key_prefix: rawKey.slice(0, 16),
      scopes: ["library:import", "journeys:read", "journeys:write"],
      allowed_phone_numbers: allowedPhoneNumbers,
      require_direct_message: true,
      created_by: context.user.id,
    };
    const { data, error } = await context.serviceSupabase
      .from("workspace_integration_keys")
      .insert(payload)
      .select("id,name,key_prefix,scopes,allowed_phone_numbers,require_direct_message,last_used_at,created_at,revoked_at")
      .single();
    if (error || !data) throw error ?? new Error("Could not create the integration key.");
    const { error: routeError } = await context.serviceSupabase.from("workspace_integration_sender_routes").insert(allowedPhoneNumbers.map((phone) => ({ integration_key_id: data.id, workspace_id: params.id, phone_number: phone, created_by: context.user.id })));
    if (routeError) throw routeError;
    return NextResponse.json({ key: data, secret: rawKey, mcpUrl: `${new URL(request.url).origin}/mcp` });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof (error as any).status === "number" ? (error as any).status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create the integration key." }, { status });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, params.id));
    const body = (await request.json()) as { keyId?: string; name?: string; allowedPhoneNumbers?: string[]; requireDirectMessage?: boolean };
    if (!body.keyId) return NextResponse.json({ error: "keyId is required." }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name.trim().slice(0, 80) || "MCP connector";
    if (body.allowedPhoneNumbers !== undefined) patch.allowed_phone_numbers = normalizePhoneList(body.allowedPhoneNumbers);
    if (body.requireDirectMessage !== undefined) patch.require_direct_message = body.requireDirectMessage;
    const { data: connector, error: connectorError } = await context.serviceSupabase.from("workspace_integration_keys").select("id,workspace_id").eq("id", body.keyId).is("revoked_at", null).maybeSingle();
    if (connectorError) throw connectorError;
    if (!connector) return NextResponse.json({ error: "Connector was not found." }, { status: 404 });
    if (body.allowedPhoneNumbers !== undefined) {
      const phones = normalizePhoneList(body.allowedPhoneNumbers);
      await context.serviceSupabase.from("workspace_integration_sender_routes").delete().eq("workspace_id", params.id).eq("integration_key_id", body.keyId);
      if (phones.length) {
        const { error: routeError } = await context.serviceSupabase.from("workspace_integration_sender_routes").insert(phones.map((phone) => ({ integration_key_id: body.keyId, workspace_id: params.id, phone_number: phone, created_by: context.user.id })));
        if (routeError) throw routeError;
      }
      delete patch.allowed_phone_numbers;
    }
    if (connector.workspace_id !== params.id) delete patch.name;
    const connectorQuery = Object.keys(patch).length
      ? context.serviceSupabase.from("workspace_integration_keys").update(patch).eq("id", body.keyId).is("revoked_at", null)
      : context.serviceSupabase.from("workspace_integration_keys").select("*").eq("id", body.keyId).is("revoked_at", null);
    const { data, error } = await connectorQuery.select("id,name,key_prefix,scopes,allowed_phone_numbers,require_direct_message,last_used_at,created_at,revoked_at").single();
    if (error) throw error;
    return NextResponse.json({ key: data });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof (error as any).status === "number" ? (error as any).status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the integration connector." }, { status });
  }
}

function normalizePhoneList(values: unknown) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(String).map((value) => value.replace(/\D/g, "")).filter((value) => value.length >= 10 && value.length <= 15).map((value) => `+${value.length === 10 ? `1${value}` : value}`)));
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, params.id));
    const body = (await request.json()) as { keyId?: string };
    if (!body.keyId) return NextResponse.json({ error: "keyId is required." }, { status: 400 });
    const { data: connector } = await context.serviceSupabase.from("workspace_integration_keys").select("workspace_id").eq("id", body.keyId).maybeSingle();
    const operation = connector?.workspace_id === params.id
      ? context.serviceSupabase.from("workspace_integration_keys").update({ revoked_at: new Date().toISOString() }).eq("id", body.keyId)
      : context.serviceSupabase.from("workspace_integration_sender_routes").delete().eq("workspace_id", params.id).eq("integration_key_id", body.keyId);
    const { error } = await operation;
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof (error as any).status === "number" ? (error as any).status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not revoke the integration key." }, { status });
  }
}
