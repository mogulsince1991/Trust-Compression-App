import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { httpError, type WorkspaceAccessContext } from "./route-auth";

export const STORAGE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const canUploadPhotos = (role: string) => ["owner", "admin", "member", "sales_rep", "library_manager"].includes(role);
export function requirePhotoWriter(context: WorkspaceAccessContext) {
  if (!canUploadPhotos(context.workspaceRole)) throw httpError(403, "Read-only members cannot add photos.");
  return context;
}
export function storageOAuthConfig() {
  const clientId = process.env.GOOGLE_STORAGE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_STORAGE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw httpError(503, "Google Drive storage needs administrator setup before it can be connected.");
  return { clientId, clientSecret };
}
function key() {
  const secret = process.env.STORAGE_CREDENTIAL_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw Error("Storage credential encryption is not configured.");
  return createHash("sha256").update(`trusttale-photo-storage:${secret}`).digest();
}
export function sealStorage(value: object, workspaceId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(workspaceId));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(b => b.toString("base64url")).join(".");
}
export function openStorage(value: string, workspaceId: string) {
  const [iv, tag, encrypted] = value.split(".").map(s => Buffer.from(s, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(workspaceId)); cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(encrypted), cipher.final()]).toString("utf8"));
}

export async function workspacePhotoToken(context: WorkspaceAccessContext, workspaceId: string) {
  requirePhotoWriter(context);
  const db = context.serviceSupabase;
  const { data: connection, error } = await db.from("workspace_photo_storage").select("*").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw httpError(503, "Could not load workspace photo storage.");
  if (!connection) throw httpError(409, "Ask a workspace admin to connect photo storage on Home first.");
  let credentials;
  try { credentials = openStorage(connection.credentials, workspaceId); }
  catch { throw httpError(409, "Photo storage needs reconnecting by a workspace admin."); }
  if (credentials.expiresAt > Date.now() + 60000) return { token: String(credentials.accessToken), connection };
  const config = storageOAuthConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: credentials.refreshToken, grant_type: "refresh_token" }), cache: "no-store", signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    if (data.error === "invalid_grant") await db.from("workspace_photo_storage").update({ status: "reconnect_required" }).eq("workspace_id", workspaceId).eq("connection_id", connection.connection_id);
    throw httpError(409, data.error === "invalid_grant" ? "Photo storage needs reconnecting by a workspace admin." : "Google Drive is temporarily unavailable. Try again shortly.");
  }
  const saved = await db.from("workspace_photo_storage").update({ credentials: sealStorage({ accessToken: data.access_token, refreshToken: data.refresh_token || credentials.refreshToken, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 }, workspaceId), status: "connected", updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("connection_id", connection.connection_id).select("connection_id").maybeSingle();
  if (saved.error || !saved.data) throw httpError(409, "Storage connection changed. Please retry.");
  return { token: String(data.access_token), connection };
}
