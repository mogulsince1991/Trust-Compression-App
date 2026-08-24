import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeJourneyEmbed } from "@/lib/journey-embeds";
import { runSourceImport } from "@/lib/import-runner";
import { parseSourceUrl } from "@/lib/source-import";

export type LibraryImportInput = {
  workspaceId: string;
  sourceUrl: string;
  userId: string | null;
  title?: string;
  summary?: string;
  mimeType?: string;
  sharing?: string;
  sourceSystem?: string;
  metadata?: Record<string, unknown>;
};

export async function importLibrarySource(supabase: SupabaseClient, input: LibraryImportInput) {
  const sourceUrl = input.sourceUrl.trim();
  const mimeType = input.mimeType?.trim().toLowerCase() ?? "";
  const parsed = tryParseSource(sourceUrl);

  const useVideoImporter = parsed?.platform === "youtube" || parsed?.kind === "drive_folder" || (parsed?.kind === "drive_file" && mimeType.startsWith("video/"));
  if (useVideoImporter && parsed) {
    const result = await runSourceImport({
      supabase,
      workspaceId: input.workspaceId,
      sourceUrl,
      userId: input.userId ?? undefined,
    });
    return {
      importType: "source" as const,
      status: "imported" as const,
      viewerAccess: viewerAccess(input.sharing),
      ...result,
    };
  }

  const normalized = normalizeJourneyEmbed({ url: sourceUrl, title: input.title ?? "" });
  const { data: existing, error: existingError } = await supabase
    .from("library_assets")
    .select("id,metadata")
    .eq("workspace_id", input.workspaceId)
    .eq("embed_url", normalized.embedUrl)
    .maybeSingle();
  if (existingError) throw existingError;

  const access = viewerAccess(input.sharing);
  const payload = {
    workspace_id: input.workspaceId,
    asset_type: normalized.assetType,
    source_platform: normalized.sourcePlatform,
    title: input.title?.trim() || normalized.title,
    source_url: normalized.sourceUrl,
    embed_url: normalized.embedUrl,
    thumbnail_url: normalized.thumbnailUrl,
    summary: input.summary?.trim() || null,
    metadata: {
      ...(existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {}),
      ...normalized.metadata,
      ...(input.metadata ?? {}),
      mimeType: input.mimeType ?? null,
      sharing: input.sharing ?? "unverified",
      viewerAccess: access,
      importedVia: input.sourceSystem?.trim() || "api",
      importedAt: new Date().toISOString(),
    },
    archived_at: null,
    created_by: input.userId,
  };

  const query = existing?.id
    ? supabase.from("library_assets").update(payload).eq("id", existing.id).eq("workspace_id", input.workspaceId)
    : supabase.from("library_assets").insert(payload);
  const { data: asset, error } = await query
    .select("id,workspace_id,asset_type,source_platform,title,source_url,embed_url,thumbnail_url,summary,metadata,created_at,updated_at,archived_at")
    .single();
  if (error || !asset) throw error ?? new Error("Could not save the library asset.");

  return {
    importType: "asset" as const,
    status: existing?.id ? "updated" as const : "imported" as const,
    viewerAccess: access,
    warning: access === "verified_public" ? null : "The Drive link was saved, but prospect access is not verified. Set the file to Anyone with the link before using it in a public journey.",
    asset,
  };
}

function tryParseSource(sourceUrl: string) {
  try {
    return parseSourceUrl(sourceUrl);
  } catch {
    return null;
  }
}

function viewerAccess(sharing?: string) {
  const normalized = sharing?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ["public", "anyone", "anyone_with_link"].includes(normalized ?? "") ? "verified_public" : "unverified";
}

