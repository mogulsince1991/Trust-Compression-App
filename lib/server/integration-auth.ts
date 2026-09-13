import { createHash } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { httpError } from "@/lib/server/route-auth";

export function hashIntegrationKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function requireIntegrationKey(request: Request) {
  const rawKey = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!rawKey?.startsWith("tc_live_")) throw httpError(401, "A Trust Compression integration key is required.");

  const serviceSupabase = createServiceSupabaseClient();
  if (!serviceSupabase) throw httpError(500, "SUPABASE_SERVICE_ROLE_KEY is not configured.");

  const { data: key, error } = await serviceSupabase
    .from("workspace_integration_keys")
    .select("id,workspace_id,name,scopes,allowed_phone_numbers,require_direct_message,revoked_at")
    .eq("key_hash", hashIntegrationKey(rawKey))
    .is("revoked_at", null)
    .maybeSingle();

  if (error) throw httpError(500, error.message);
  if (!key) throw httpError(401, "That Trust Compression integration key is invalid or revoked.");

  await serviceSupabase.from("workspace_integration_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  return { serviceSupabase, key };
}

export function normalizePhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  throw httpError(400, "A valid sender phone number is required.");
}

export function requireDirectMessageAccess(
  key: { allowed_phone_numbers?: unknown; require_direct_message?: boolean | null },
  input: { senderPhone?: unknown; messageChannel?: unknown }
) {
  if (key.require_direct_message !== false && input.messageChannel !== "direct_message") {
    throw httpError(403, "Journey actions require a direct inbound message.");
  }
  const sender = normalizePhoneNumber(typeof input.senderPhone === "string" ? input.senderPhone : "");
  const allowed = Array.isArray(key.allowed_phone_numbers)
    ? key.allowed_phone_numbers.map((value) => normalizePhoneNumber(String(value)))
    : [];
  if (!allowed.includes(sender)) throw httpError(403, "This sender is not allowed to use this connector.");
  return sender;
}

export async function resolveDirectMessageWorkspace(
  serviceSupabase: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  key: { id: string; workspace_id: string; allowed_phone_numbers?: unknown; require_direct_message?: boolean | null },
  input: { senderPhone?: unknown; messageChannel?: unknown; workspaceHint?: unknown }
) {
  if (key.require_direct_message !== false && input.messageChannel !== "direct_message") {
    throw httpError(403, "Journey actions require a direct inbound message.");
  }
  const sender = normalizePhoneNumber(typeof input.senderPhone === "string" ? input.senderPhone : "");
  const { data: routes, error } = await serviceSupabase
    .from("workspace_integration_sender_routes")
    .select("workspace_id")
    .eq("integration_key_id", key.id)
    .eq("phone_number", sender);
  if (error) throw httpError(500, error.message);
  if (routes?.length === 1) return { workspaceId: routes[0].workspace_id as string, sender };
  if ((routes?.length ?? 0) > 1) {
    const ids = routes!.map((route) => route.workspace_id as string);
    const { data: workspaces, error: workspaceError } = await serviceSupabase.from("workspaces").select("id,name,slug").in("id", ids);
    if (workspaceError) throw httpError(500, workspaceError.message);
    const hint = typeof input.workspaceHint === "string" ? input.workspaceHint.trim().toLowerCase() : "";
    const matches = hint ? (workspaces ?? []).filter((workspace) => workspace.id.toLowerCase() === hint || workspace.slug?.toLowerCase() === hint || workspace.name?.toLowerCase() === hint) : [];
    if (matches.length === 1) return { workspaceId: matches[0].id as string, sender };
    const options = (workspaces ?? []).map((workspace) => workspace.name).filter(Boolean).join(", ");
    throw httpError(409, `This sender can access multiple workspaces. Ask which workspace they mean${options ? `: ${options}` : "."}`);
  }

  // Existing single-workspace connectors remain functional during migration.
  requireDirectMessageAccess(key, input);
  return { workspaceId: key.workspace_id, sender };
}

export function requireIntegrationScope(scopes: unknown, required: string) {
  const values = Array.isArray(scopes) ? scopes.map(String) : [];
  if (!values.includes(required) && !values.includes("admin")) {
    throw httpError(403, `This integration key is missing the ${required} scope.`);
  }
}
