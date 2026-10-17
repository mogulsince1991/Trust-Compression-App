import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { httpError, requireWorkspaceAccess, requireWorkspaceManager } from "@/lib/server/route-auth";
import { downloadPhoto, PHOTOS_BUCKET, photoAssetId, pickerRequest, signPhoto, verifyPhoto, type PickedPhoto } from "@/lib/server/google-photos";
import { uploadPhotoToDrive } from "@/lib/server/google-photos-drive";

export const maxDuration = 180;
export const dynamic = "force-dynamic";
const json = (data: object, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") || "";
    requireWorkspaceManager(await requireWorkspaceAccess(request, workspaceId));
    const clientId = process.env.GOOGLE_PHOTOS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) throw httpError(503, "Google Photos needs setup. Ask your administrator to configure the Google Photos OAuth client.");
    return json({ clientId });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 24000) throw httpError(413, "Request too large.");
    const body = JSON.parse(raw);
    const { workspaceId, action, googleToken, sessionId } = body;
    if (typeof workspaceId !== "string") throw httpError(400, "Workspace is required.");
    const { serviceSupabase, user } = requireWorkspaceManager(await requireWorkspaceAccess(request, workspaceId));
    if (typeof googleToken !== "string" || !googleToken || googleToken.length > 4096) throw httpError(400, "Connect Google Photos first.");
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (action === "create") {
      const session = await pickerRequest(googleToken, "sessions", "POST", { pickingConfig: { maxItemCount: "100" } });
      return json({ sessionId: session.id, pickerUri: session.pickerUri });
    }
    if (action === "list" || action === "close") {
      if (typeof sessionId !== "string" || !/^[\w-]+$/.test(sessionId)) throw httpError(400, "Invalid Google Photos session.");
      if (action === "close") { await pickerRequest(googleToken, `sessions/${sessionId}`, "DELETE"); return json({ ok: true }); }
      const session = await pickerRequest(googleToken, `sessions/${sessionId}`);
      if (!session.mediaItemsSet) return json({ pending: true });
      const items: PickedPhoto[] = [];
      let pageToken = "";
      do {
        const params = new URLSearchParams({ sessionId, pageSize: "100", ...(pageToken ? { pageToken } : {}) });
        const page = await pickerRequest(googleToken, `mediaItems?${params}`);
        items.push(...(page.mediaItems || []));
        pageToken = page.nextPageToken || "";
        if (items.length > 100) throw httpError(400, "Select at most 100 photos per import.");
      } while (pageToken);
      return json({ photos: items.filter(item => item.type === "PHOTO").map(photo => ({ id: photo.id, name: photo.mediaFile.filename || "Photo", ticket: signPhoto(photo, workspaceId, user.id, secret) })), skipped: items.filter(item => item.type !== "PHOTO").length });
    }
    if (action !== "import" || body.consent !== true || body.driveSharingConsent !== true || typeof body.ticket !== "string") throw httpError(400, "Confirm copying to your Google Drive and enabling link sharing before importing.");
    const photo = verifyPhoto(body.ticket, workspaceId, user.id, secret);
    const id = photoAssetId(workspaceId, photo.id);
    const { data: existing, error: lookupError } = await serviceSupabase.from("library_assets").select("id,archived_at,metadata").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
    if (lookupError) throw httpError(500, "Could not check existing photos.");
    if (existing?.metadata?.driveFileId && !existing.metadata?.photoDeleted) {
      await removeLegacyCopy(serviceSupabase, workspaceId, id, existing.metadata);
      if (existing.archived_at) {
        const { error } = await serviceSupabase.from("library_assets").update({ archived_at: null }).eq("workspace_id", workspaceId).eq("id", id);
        if (error) throw httpError(500, "Could not restore this photo.");
      }
      return json({ status: existing.archived_at ? "restored" : "existing" });
    }
    const { bytes, mime } = await downloadPhoto(photo, googleToken);
    const driveFileId = await uploadPhotoToDrive(googleToken, workspaceId, id, photo.mediaFile.filename || "Photo.jpg", bytes, mime);
    const photoKey = existing?.metadata?.photoKey || randomBytes(32).toString("hex");
    const mediaUrl = `${new URL(request.url).origin}/api/media/photos/${photoKey}`;
    const payload = {
      id, workspace_id: workspaceId, created_by: user.id, asset_type: "embed", source_platform: "image",
      title: (photo.mediaFile.filename || "Photo").slice(0,250), source_url: `https://drive.google.com/file/d/${driveFileId}/view`, embed_url: mediaUrl, thumbnail_url: mediaUrl,
      archived_at: null,
      metadata: { provider: "google_photos", photoKey, driveFileId, storagePath: existing?.metadata?.storagePath || null, googlePhotosId: photo.id, originalTitle: photo.mediaFile.filename || "Photo", width: photo.mediaFile.mediaFileMetadata?.width, height: photo.mediaFile.mediaFileMetadata?.height, capturedAt: photo.createTime, importedBytes: bytes.length },
    };
    const { error } = existing ? await serviceSupabase.from("library_assets").update(payload).eq("id", id).eq("workspace_id", workspaceId) : await serviceSupabase.from("library_assets").insert(payload);
    if (error) {
      if (error.code === "23505") return json({ status: "existing" });
      throw httpError(500, "Photo uploaded to Drive, but the library could not save it. Retry to recover the uploaded file.");
    }
    await removeLegacyCopy(serviceSupabase, workspaceId, id, payload.metadata);
    return json({ status: "imported" });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    const { workspaceId, assetId } = await request.json();
    const { serviceSupabase } = requireWorkspaceManager(await requireWorkspaceAccess(request, workspaceId));
    const { data, error } = await serviceSupabase.from("library_assets").select("metadata").eq("workspace_id", workspaceId).eq("id", assetId).single();
    if (error || data.metadata?.provider !== "google_photos") throw httpError(404, "Photo not found.");
    if (data.metadata.driveFileId) {
      await removeLegacyCopy(serviceSupabase, workspaceId, assetId, data.metadata);
      const saved = await serviceSupabase.from("library_assets").update({ archived_at: new Date().toISOString(), metadata: { provider: "google_photos", photoDeleted: true } }).eq("workspace_id", workspaceId).eq("id", assetId);
      if (saved.error) throw httpError(500, "Could not remove the photo reference.");
      return json({ ok: true });
    }
    const path = `${workspaceId}/${data.metadata.photoKey}`;
    if (data.metadata.storagePath !== path || !/^[a-f0-9]{64}$/.test(data.metadata.photoKey)) throw httpError(400, "Photo has already been removed.");
    const removed = await serviceSupabase.storage.from(PHOTOS_BUCKET).remove([path]);
    if (removed.error) throw httpError(500, "Could not delete the stored photo. Please retry.");
    const saved = await serviceSupabase.from("library_assets").update({ archived_at: new Date().toISOString(), metadata: { provider: "google_photos", photoDeleted: true } }).eq("workspace_id", workspaceId).eq("id", assetId);
    if (saved.error) throw httpError(500, "Photo copy deleted, but the library could not update. Please retry.");
    return json({ ok: true });
  } catch (error) { return failure(error); }
}

async function removeLegacyCopy(db: Awaited<ReturnType<typeof requireWorkspaceAccess>>["serviceSupabase"], workspaceId: string, id: string, metadata: Record<string, any>) {
  if (!metadata.storagePath || !metadata.driveFileId) return;
  if (!/^[a-f0-9]{64}$/.test(metadata.photoKey) || metadata.storagePath !== `${workspaceId}/${metadata.photoKey}`) throw httpError(400, "Invalid temporary photo path; cleanup stopped.");
  const removed = await db.storage.from(PHOTOS_BUCKET).remove([metadata.storagePath]);
  if (removed.error) throw httpError(500, "Photo is saved in Drive, but Supabase cleanup failed. Retry the import to finish cleanup.");
  const updated = await db.from("library_assets").update({ metadata: { ...metadata, storagePath: null } }).eq("workspace_id", workspaceId).eq("id", id);
  if (updated.error) throw httpError(500, "Photo copy removed, but cleanup status could not be saved. Retry the import.");
}

function failure(error: unknown) {
  const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 400;
  return json({ error: error instanceof Error ? error.message : "Google Photos import failed." }, status);
}
