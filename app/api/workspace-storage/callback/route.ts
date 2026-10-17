import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { openStorage, sealStorage, STORAGE_SCOPE, storageOAuthConfig } from "@/lib/server/workspace-photo-storage";
import { photoDriveFolder } from "@/lib/server/google-photos-drive";

export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const redirect = new URL("/app/home", request.url);
  try {
    const state = request.nextUrl.searchParams.get("state"), code = request.nextUrl.searchParams.get("code");
    if (!state || state !== request.cookies.get("tt_storage_oauth")?.value || !code) throw Error("Connection canceled or expired. Try again from Home.");
    const db = createServiceSupabaseClient();
    if (!db) throw Error("Storage configuration unavailable.");
    const { data: pending, error } = await db.from("photo_storage_oauth_states").delete().eq("state_hash", createHash("sha256").update(state).digest("hex")).gt("expires_at", new Date().toISOString()).select("*").maybeSingle();
    if (error || !pending) throw Error("Connection expired. Try again from Home.");
    const member = await db.from("workspace_members").select("role").eq("workspace_id", pending.workspace_id).eq("user_id", pending.user_id).maybeSingle();
    if (!["owner", "admin"].includes(member.data?.role)) throw Error("Only workspace admins can connect storage.");
    const config = storageOAuthConfig();
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, code_verifier: openStorage(pending.verifier, pending.workspace_id).verifier, grant_type: "authorization_code", redirect_uri: `${request.nextUrl.origin}/api/workspace-storage/callback` }), cache: "no-store", signal: AbortSignal.timeout(20000) });
    const token = await response.json();
    if (!response.ok || !token.access_token || !token.refresh_token || !String(token.scope).split(" ").includes(STORAGE_SCOPE)) throw Error("Google Drive permission was not fully granted. Reconnect and allow file access.");
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(15000) });
    if (!profileResponse.ok) throw Error("Could not identify the connected Google account.");
    const profile = await profileResponse.json();
    const folderId = await photoDriveFolder(token.access_token, pending.workspace_id);
    const result = await db.from("workspace_photo_storage").upsert({ workspace_id: pending.workspace_id, connection_id: randomUUID(), account_label: profile.email || "Google Drive", folder_id: folderId, folder_name: "TrustTale Photos", credentials: sealStorage({ accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + (token.expires_in || 3600) * 1000 }, pending.workspace_id), connected_by: pending.user_id, status: "connected", last_error: null, updated_at: new Date().toISOString() });
    if (result.error) throw Error("Could not save the workspace storage connection.");
    redirect.searchParams.set("photo_storage", "connected");
  } catch (e) { redirect.searchParams.set("storage_error", e instanceof Error ? e.message : "Connection failed. Please try again."); }
  const result = NextResponse.redirect(redirect);
  result.cookies.set("tt_storage_oauth", "", { path: "/api/workspace-storage", maxAge: 0 });
  return result;
}
