import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyVideo } from "@/lib/smart-organize";
import { importSourceVideos, parseSourceUrl, type ImportedVideo, type ParsedSource } from "@/lib/source-import";

type RunSourceImportInput = {
  supabase: SupabaseClient;
  workspaceId: string;
  sourceUrl: string;
  userId: string;
  sourceId?: string;
};

export type RunSourceImportResult = {
  sourceId: string;
  platform: string;
  kind: string;
  importMode: string;
  imported: number;
  updated: number;
  skippedDuplicates: number;
  duplicateCandidates: number;
  total: number;
};

type ExistingVideo = {
  id: string;
  title: string | null;
  thumbnail_url: string | null;
  metadata: Record<string, unknown> | null;
};

export async function runSourceImport({ supabase, workspaceId, sourceUrl, userId, sourceId }: RunSourceImportInput): Promise<RunSourceImportResult> {
  const parsed = parseSourceUrl(sourceUrl);
  const youtubeApiKey = getFirstEnv("YOUTUBE_API_KEY", "GOOGLE_YOUTUBE_API_KEY");
  const driveApiKey = getFirstEnv("GOOGLE_DRIVE_API_KEY", "GOOGLE_API_KEY");
  const videos = await importSourceVideos(parsed, { youtubeApiKey, driveApiKey });
  const importMode = String(videos[0]?.metadata.importMode ?? "unknown");

  const source = sourceId ? await updateExistingSource(supabase, sourceId, workspaceId, parsed, sourceUrl, importMode) : await createSource(supabase, workspaceId, parsed, sourceUrl, importMode);
  const run = await createSyncRun(supabase, workspaceId, source.id);

  let imported = 0;
  let updated = 0;
  let skippedDuplicates = 0;
  let duplicateCandidates = 0;

  try {
    for (const video of videos) {
      const result = await persistImportedVideo({ supabase, workspaceId, sourceId: source.id, sourceUrl, parsed, video, userId });
      imported += result.imported;
      updated += result.updated;
      skippedDuplicates += result.skippedDuplicates;
      duplicateCandidates += result.duplicateCandidates;
    }

    await Promise.all([
      supabase
        .from("source_sync_runs")
        .update({
          status: "complete",
          imported_count: imported,
          updated_count: updated,
          skipped_duplicate_count: skippedDuplicates,
          duplicate_candidate_count: duplicateCandidates,
          completed_at: new Date().toISOString()
        })
        .eq("id", run.id),
      supabase
        .from("sources")
        .update({
          status: "connected",
          last_synced_at: new Date().toISOString(),
          error: null,
          metadata: {
            ...(source.metadata ?? {}),
            sourceUrl,
            canonicalUrl: parsed.canonicalUrl,
            kind: parsed.kind,
            importMode,
            imported,
            updated,
            skippedDuplicates,
            duplicateCandidates
          }
        })
        .eq("id", source.id)
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Source import failed.";
    await Promise.all([
      supabase.from("source_sync_runs").update({ status: "error", error: message, completed_at: new Date().toISOString() }).eq("id", run.id),
      supabase.from("sources").update({ status: "error", error: message }).eq("id", source.id)
    ]);
    throw error;
  }

  return { sourceId: source.id, platform: parsed.platform, kind: parsed.kind, importMode, imported, updated, skippedDuplicates, duplicateCandidates, total: videos.length };
}

async function createSource(supabase: SupabaseClient, workspaceId: string, parsed: ParsedSource, sourceUrl: string, importMode: string) {
  const { data, error } = await supabase
    .from("sources")
    .insert({
      workspace_id: workspaceId,
      platform: parsed.platform,
      account_label: sourceLabel(parsed),
      status: "syncing",
      metadata: {
        sourceUrl,
        canonicalUrl: parsed.canonicalUrl,
        kind: parsed.kind,
        importMode,
        requiresApiKeyForBulk: (parsed.kind === "youtube_playlist" && !getFirstEnv("YOUTUBE_API_KEY", "GOOGLE_YOUTUBE_API_KEY")) || (parsed.kind === "drive_folder" && !getFirstEnv("GOOGLE_DRIVE_API_KEY", "GOOGLE_API_KEY"))
      }
    })
    .select("id,metadata")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not save the source.");
  return data as { id: string; metadata: Record<string, unknown> | null };
}

async function updateExistingSource(supabase: SupabaseClient, sourceId: string, workspaceId: string, parsed: ParsedSource, sourceUrl: string, importMode: string) {
  const { data: existing } = await supabase.from("sources").select("metadata").eq("id", sourceId).eq("workspace_id", workspaceId).maybeSingle();
  const { data, error } = await supabase
    .from("sources")
    .update({
      status: "syncing",
      error: null,
      metadata: {
        ...(existing?.metadata ?? {}),
        sourceUrl,
        canonicalUrl: parsed.canonicalUrl,
        kind: parsed.kind,
        importMode
      }
    })
    .eq("id", sourceId)
    .eq("workspace_id", workspaceId)
    .select("id,metadata")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not update the source.");
  return data as { id: string; metadata: Record<string, unknown> | null };
}

async function createSyncRun(supabase: SupabaseClient, workspaceId: string, sourceId: string) {
  const { data, error } = await supabase.from("source_sync_runs").insert({ workspace_id: workspaceId, source_id: sourceId, status: "running" }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Could not start source sync.");
  return data as { id: string };
}

async function persistImportedVideo({ supabase, workspaceId, sourceId, sourceUrl, parsed, video, userId }: { supabase: SupabaseClient; workspaceId: string; sourceId: string; sourceUrl: string; parsed: ParsedSource; video: ImportedVideo; userId: string }) {
  const existingByLink = await findExistingBySourceLink(supabase, workspaceId, parsed.platform, video.externalId);
  const existingByLegacy = existingByLink ? null : await findExistingByLegacyKey(supabase, workspaceId, parsed.platform, video.externalId);
  const existingId = existingByLink?.video_id ?? existingByLegacy?.id ?? null;
  const existingVideo = existingId ? await findExistingVideo(supabase, workspaceId, existingId) : null;
  const smart = classifyVideo({ title: video.title, summary: video.description, tags: Array.isArray(video.metadata.tags) ? (video.metadata.tags as string[]) : [] });
  const platformTag = parsed.platform === "google_drive" ? "Google Drive" : "YouTube";
  const existingMetadata = existingVideo?.metadata ?? {};
  const localTitleOverride = Boolean(existingMetadata.localTitleOverride);
  const localThumbnailOverride = Boolean(existingMetadata.localThumbnailOverride);
  const payload = {
    workspace_id: workspaceId,
    source_id: sourceId,
    external_id: video.externalId,
    title: localTitleOverride ? existingVideo?.title ?? video.title : video.title,
    source_platform: parsed.platform,
    source_url: video.sourceUrl,
    embed_url: video.embedUrl,
    thumbnail_url: localThumbnailOverride ? existingVideo?.thumbnail_url ?? video.thumbnailUrl : video.thumbnailUrl,
    duration_seconds: video.durationSeconds,
    summary: video.description?.slice(0, 500) ?? null,
    proof_type: smart.category,
    buying_stage: smart.stage,
    sales_category: smart.category,
    funnel_stage: smart.stage,
    transcript_status: video.metadata.captionAvailable ? "available" : "pending",
    tags: Array.from(new Set([platformTag, ...smart.tags])),
    published_at: video.publishedAt,
    deleted_at: null,
    metadata: {
      ...existingMetadata,
      ...video.metadata,
      channelTitle: video.channelTitle,
      sourceUrl,
      canonicalSourceUrl: parsed.canonicalUrl,
      importedTitle: video.title,
      importedThumbnailUrl: video.thumbnailUrl,
      originalTitle: existingMetadata.originalTitle ?? video.title,
      originalThumbnailUrl: existingMetadata.originalThumbnailUrl ?? video.thumbnailUrl,
      localTitleOverride,
      localThumbnailOverride,
      normalizedTitle: normalizeTitle(video.title),
      salesCategory: smart.category,
      funnelStage: smart.stage
    },
    created_by: userId,
    updated_at: new Date().toISOString()
  };

  if (existingId) {
    const { error } = await supabase.from("videos").update(payload).eq("id", existingId);
    if (error) throw error;
    await upsertSourceLink(supabase, workspaceId, existingId, sourceId, parsed, video);
    return { imported: 0, updated: 1, skippedDuplicates: existingByLink ? 1 : 0, duplicateCandidates: 0 };
  }

  const likelyDuplicate = await findLikelyDuplicate(supabase, workspaceId, video);
  const { data: inserted, error } = await supabase.from("videos").insert(payload).select("id").single();
  if (error || !inserted) throw error ?? new Error("Could not insert imported video.");

  await upsertSourceLink(supabase, workspaceId, inserted.id, sourceId, parsed, video);

  if (likelyDuplicate) {
    await supabase.from("duplicate_candidates").insert({
      workspace_id: workspaceId,
      existing_video_id: likelyDuplicate.id,
      candidate_video_id: inserted.id,
      source_id: sourceId,
      reason: likelyDuplicate.reason,
      confidence: likelyDuplicate.confidence,
      metadata: {
        existingTitle: likelyDuplicate.title,
        candidateTitle: video.title,
        candidatePlatform: parsed.platform,
        candidateSourceUrl: video.sourceUrl
      }
    });
  }

  return { imported: 1, updated: 0, skippedDuplicates: 0, duplicateCandidates: likelyDuplicate ? 1 : 0 };
}

async function findExistingBySourceLink(supabase: SupabaseClient, workspaceId: string, platform: string, externalId: string) {
  const { data } = await supabase.from("video_source_links").select("video_id").eq("workspace_id", workspaceId).eq("platform", platform).eq("external_id", externalId).maybeSingle();
  return data as { video_id: string } | null;
}

async function findExistingByLegacyKey(supabase: SupabaseClient, workspaceId: string, platform: string, externalId: string) {
  const { data } = await supabase.from("videos").select("id").eq("workspace_id", workspaceId).eq("source_platform", platform).eq("external_id", externalId).maybeSingle();
  return data as { id: string } | null;
}

async function findExistingVideo(supabase: SupabaseClient, workspaceId: string, videoId: string) {
  const { data } = await supabase.from("videos").select("id,title,thumbnail_url,metadata").eq("workspace_id", workspaceId).eq("id", videoId).maybeSingle();
  return data as ExistingVideo | null;
}

async function findLikelyDuplicate(supabase: SupabaseClient, workspaceId: string, video: ImportedVideo) {
  const normalized = normalizeTitle(video.title);
  if (!normalized || normalized.length < 8) return null;

  const { data } = await supabase
    .from("videos")
    .select("id,title,duration_seconds,source_platform,metadata")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .limit(80);

  for (const row of data ?? []) {
    const rowTitle = normalizeTitle(row.title ?? "");
    const titleMatches = rowTitle === normalized || rowTitle.includes(normalized) || normalized.includes(rowTitle);
    const durationMatches = !video.durationSeconds || !row.duration_seconds || Math.abs(Number(row.duration_seconds) - video.durationSeconds) <= 4;
    if (titleMatches && durationMatches) {
      return { id: row.id as string, title: row.title as string, reason: "Similar title and duration", confidence: durationMatches ? 0.86 : 0.7 };
    }
  }

  return null;
}

async function upsertSourceLink(supabase: SupabaseClient, workspaceId: string, videoId: string, sourceId: string, parsed: ParsedSource, video: ImportedVideo) {
  const { error } = await supabase.from("video_source_links").upsert(
    {
      workspace_id: workspaceId,
      video_id: videoId,
      source_id: sourceId,
      platform: parsed.platform,
      external_id: video.externalId,
      source_url: video.sourceUrl,
      canonical_url: parsed.canonicalUrl,
      metadata: video.metadata
    },
    { onConflict: "workspace_id,platform,external_id" }
  );
  if (error) throw error;
}

function sourceLabel(parsed: ParsedSource) {
  if (parsed.kind === "drive_folder") return "Google Drive folder";
  if (parsed.kind === "drive_file") return "Google Drive video";
  if (parsed.kind === "youtube_video") return "YouTube video";
  if (parsed.kind === "youtube_playlist") return "YouTube playlist";
  return parsed.handle ? `YouTube @${parsed.handle}` : "YouTube channel";
}

function getFirstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(shorts?|reels?|instagram|youtube|facebook|tiktok|official|full video)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
