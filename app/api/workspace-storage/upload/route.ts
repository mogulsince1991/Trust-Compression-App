import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/server/route-auth";
import { requirePhotoWriter, workspacePhotoToken } from "@/lib/server/workspace-photo-storage";
import { photoAssetId } from "@/lib/server/google-photos";
import { uploadPhotoToDrive } from "@/lib/server/google-photos-drive";

export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") || "";
    const context = requirePhotoWriter(await requireWorkspaceAccess(request, workspaceId));
    if (Number(request.headers.get("content-length") || 0) > 4 * 1024 * 1024) throw Error("Photo is too large. Choose a smaller image.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 3500000 || form.get("sharingConsent") !== "true") throw Error("Choose a photo under 3.5 MB and confirm journey link sharing.");
    const bytes = Buffer.from(await file.arrayBuffer());
    // Uploads are raster images only; never serve arbitrary HTML/SVG as photo content.
    const mime = bytes[0] === 255 && bytes[1] === 216 ? "image/jpeg" : bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : bytes.subarray(0,4).toString() === "RIFF" && bytes.subarray(8,12).toString() === "WEBP" ? "image/webp" : "";
    if (!mime) throw Error("Use a JPEG, PNG or WebP image. Export HEIC photos as JPEG first.");
    const db = context.serviceSupabase;
    const id = photoAssetId(workspaceId, `upload:${createHash("sha256").update(bytes).digest("hex")}`);
    const existing = await db.from("library_assets").select("id,archived_at,metadata").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
    if (existing.error) throw Error("Could not check the library for existing photos.");
    if (existing.data && !existing.data.archived_at && !existing.data.metadata?.photoDeleted) return NextResponse.json({ status: "existing" });
    const { token, connection } = await workspacePhotoToken(context, workspaceId);
    const fileId = await uploadPhotoToDrive(token, workspaceId, id, file.name, bytes, mime, connection.folder_id);
    const active = await db.from("workspace_photo_storage").select("connection_id").eq("workspace_id", workspaceId).eq("connection_id", connection.connection_id).maybeSingle();
    if (!active.data) throw Error("Storage was disconnected during upload. The copy remains in Drive; reconnect before retrying.");
    const photoKey = existing.data?.metadata?.photoKey || randomBytes(32).toString("hex");
    const mediaUrl = `${new URL(request.url).origin}/api/media/photos/${photoKey}`;
    const payload = { id, workspace_id: workspaceId, created_by: context.user.id, asset_type: "embed", source_platform: "image", title: file.name.slice(0,250), source_url: `https://drive.google.com/file/d/${fileId}/view`, embed_url: mediaUrl, thumbnail_url: mediaUrl, archived_at: null, metadata: { provider: "workspace_photo", photoKey, driveFileId: fileId, originalTitle: file.name, importedBytes: bytes.length } };
    const saved = existing.data ? await db.from("library_assets").update(payload).eq("workspace_id", workspaceId).eq("id", id) : await db.from("library_assets").insert(payload);
    if (saved.error && saved.error.code !== "23505") throw Error("Saved to Drive, but the library could not update. Retry to recover the uploaded photo.");
    return NextResponse.json({ status: "imported" });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Photo upload failed." }, { status: typeof e === "object" && e && "status" in e ? Number(e.status) : 400 }); }
}
