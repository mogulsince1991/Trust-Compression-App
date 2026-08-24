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
    .select("id,workspace_id,name,scopes,revoked_at")
    .eq("key_hash", hashIntegrationKey(rawKey))
    .is("revoked_at", null)
    .maybeSingle();

  if (error) throw httpError(500, error.message);
  if (!key) throw httpError(401, "That Trust Compression integration key is invalid or revoked.");

  await serviceSupabase.from("workspace_integration_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  return { serviceSupabase, key };
}

export function requireIntegrationScope(scopes: unknown, required: string) {
  const values = Array.isArray(scopes) ? scopes.map(String) : [];
  if (!values.includes(required) && !values.includes("library:write")) {
    throw httpError(403, `This integration key is missing the ${required} scope.`);
  }
}

