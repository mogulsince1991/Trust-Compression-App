import { createHash } from "node:crypto";

async function drive(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error(response.status === 401 ? "Google access expired. Reconnect Photos and Drive." : "Google Drive could not complete the transfer. Check Drive permissions, available space and link-sharing restrictions, then retry.");
  return response.json();
}

export async function photoDriveFolder(token: string, workspaceId: string) {
  const marker = createHash("sha256").update(workspaceId).digest("hex");
  const params = new URLSearchParams({ q: `trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='trusttaleWorkspace' and value='${marker}' }`, fields: "files(id)", pageSize: "1" });
  const existing = await drive(token, `files?${params}`);
  if (existing.files?.[0]?.id) return existing.files[0].id as string;
  const folder = await drive(token, "files?fields=id", { method: "POST", body: JSON.stringify({ name: `TrustTale Photos - ${workspaceId.slice(0,8)}`, mimeType: "application/vnd.google-apps.folder", appProperties: { trusttaleWorkspace: marker } }) });
  return folder.id as string;
}

export async function uploadPhotoToDrive(token: string, workspaceId: string, assetId: string, name: string, bytes: Buffer, mime: string) {
  const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string,string>)[mime];
  if (!extension) throw Error("Unsupported photo format.");
  const filename = `${name.replace(/\.[^.]+$/, "").slice(0,220) || "Photo"}.${extension}`;
  const checksum = createHash("md5").update(bytes).digest("hex");
  const params = new URLSearchParams({ q: `trashed = false and appProperties has { key='trusttaleAsset' and value='${assetId}' }`, fields: "files(id,size,md5Checksum)", pageSize: "1" });
  const previous = await drive(token, `files?${params}`);
  let file = previous.files?.[0];
  if (!file) {
    const folderId = await photoDriveFolder(token, workspaceId);
    const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,md5Checksum", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Upload-Content-Type": mime, "X-Upload-Content-Length": String(bytes.length) },
      body: JSON.stringify({ name: filename, parents: [folderId], appProperties: { trusttaleAsset: assetId } }),
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000),
    });
    const location = start.headers.get("location");
    if (!start.ok || !location) throw Error("Could not start the Google Drive upload. No Supabase copy was created.");
    const uploadUrl = new URL(location);
    if (uploadUrl.protocol !== "https:" || uploadUrl.hostname !== "www.googleapis.com" || !uploadUrl.pathname.startsWith("/upload/drive/") || uploadUrl.port || uploadUrl.username || uploadUrl.password) throw Error("Invalid Drive upload address.");
    const uploaded = await fetch(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": mime }, body: new Uint8Array(bytes), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (!uploaded.ok) throw Error("Google Drive upload did not finish. Your Google Photos original is unchanged; retry the import.");
    file = await uploaded.json();
  }
  if (!file?.id || !/^[\w-]+$/.test(file.id)) throw Error("Google Drive did not confirm a file ID.");
  // Confirm persisted bytes before changing references or deleting any legacy copy.
  const verified = await drive(token, `files/${file.id}?fields=id,size,md5Checksum,trashed`);
  if (verified.trashed || Number(verified.size) !== bytes.length || verified.md5Checksum !== checksum) throw Error("Drive upload verification failed. Any existing copy has been kept.");
  const permissions = await drive(token, `files/${file.id}/permissions?fields=permissions(id,type,role)`);
  if (!permissions.permissions?.some((p: { type: string; role: string }) => p.type === "anyone" && p.role === "reader")) {
    await drive(token, `files/${file.id}/permissions`, { method: "POST", body: JSON.stringify({ type: "anyone", role: "reader", allowFileDiscovery: false }) });
  }
  return file.id as string;
}
