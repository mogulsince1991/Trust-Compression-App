import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function saveDriveImage(db: SupabaseClient, workspaceId: string, file: { id: string; title: string; description?: string | null; metadata?: Record<string, unknown> }, userId?: string, automatic = false) {
  const sourceUrl = `https://drive.google.com/file/d/${file.id}/view`;
  const { data: existing, error: lookupError } = await db.from("library_assets").select("id,title,thumbnail_url,metadata").eq("workspace_id", workspaceId).eq("source_url", sourceUrl).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing && automatic) return { imported: 0, updated: 0, skippedDuplicates: 1, duplicateCandidates: 0 };
  const hash = createHash("sha256").update(`drive-image:${workspaceId}:${file.id}`).digest("hex");
  const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  const imageUrl = `/api/media/drive/${file.id}/preview?image=1&size=1200`;
  const metadata = existing?.metadata || {};
  const payload = { workspace_id: workspaceId, asset_type: "embed", source_platform: "image", source_url: sourceUrl,
    embed_url: imageUrl, thumbnail_url: metadata.localThumbnailOverride ? existing.thumbnail_url : imageUrl,
    title: metadata.localTitleOverride ? existing.title : file.title, summary: file.description || null,
    metadata: { ...file.metadata, ...metadata, provider: "google_drive", fileId: file.id, originalTitle: file.title, measurement: "unavailable" } };
  const result = existing
    ? await db.from("library_assets").update(payload).eq("id", existing.id).eq("workspace_id", workspaceId)
    : await db.from("library_assets").insert({ ...payload, id, created_by: userId || null });
  if (result.error?.code === "23505") return { imported: 0, updated: 0, skippedDuplicates: 1, duplicateCandidates: 0 };
  if (result.error) throw result.error;
  return { imported: existing ? 0 : 1, updated: existing ? 1 : 0, skippedDuplicates: 0, duplicateCandidates: 0 };
}
