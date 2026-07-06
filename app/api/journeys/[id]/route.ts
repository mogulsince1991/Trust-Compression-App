import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";
import { normalizeJourneyEmbed, type JourneyAssetType } from "@/lib/journey-embeds";

type RouteContext = {
  params: { id: string };
};

type JourneyPatchRequest = {
  workspaceId?: string;
  title?: string;
  heading?: string;
  description?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  folderName?: string;
  parentFolderName?: string;
  assets?: Array<{
    videoId?: string | null;
    assetType?: JourneyAssetType;
    sourcePlatform?: string | null;
    title?: string | null;
    sourceUrl?: string | null;
    embedUrl?: string | null;
    thumbnailUrl?: string | null;
    durationSeconds?: number | null;
    summary?: string | null;
    note?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  videoIds?: string[];
  publish?: boolean;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in before editing journeys." }, { status: 401 });

    const body = (await request.json()) as JourneyPatchRequest;
    const workspaceId = body.workspaceId?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const folderId = body.folderName?.trim() ? await ensureFolder(supabase, workspaceId, user.id, body.folderName.trim(), body.parentFolderName?.trim()) : undefined;
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (body.title !== undefined) patch.title = body.title.trim() || "Untitled journey";
    if (body.heading !== undefined) patch.heading = body.heading.trim() || body.title?.trim() || "A focused proof journey";
    if (body.description !== undefined) patch.description = body.description.trim() || null;
    if (body.ctaLabel !== undefined) patch.cta_label = body.ctaLabel.trim() || "Continue the conversation";
    if (body.ctaUrl !== undefined) patch.cta_url = body.ctaUrl.trim() || null;
    if (folderId !== undefined) patch.folder_id = folderId;
    if (body.publish) {
      patch.is_public = true;
      patch.published_at = new Date().toISOString();
    }

    const { data: journey, error: journeyError } = await supabase
      .from("journeys")
      .update(patch)
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .select("id,share_token,title,heading,description,cta_label,cta_url,folder_id,is_public,published_at")
      .single();

    if (journeyError || !journey) return NextResponse.json({ error: journeyError?.message ?? "Journey was not found." }, { status: 404 });

    if (body.assets || body.videoIds) {
      const videoIds = Array.from(new Set(body.videoIds ?? [])).filter(Boolean);
      const resolvedAssets = await resolveJourneyAssets(supabase, workspaceId, Array.isArray(body.assets) ? body.assets : [], videoIds);
      await supabase.from("journey_assets").delete().eq("journey_id", params.id);
      if (resolvedAssets.length) {
        const { error: assetsError } = await supabase.from("journey_assets").insert(
          resolvedAssets.map((asset, index) => ({
            journey_id: params.id,
            video_id: asset.video_id,
            asset_type: asset.asset_type,
            source_platform: asset.source_platform,
            title: asset.title,
            source_url: asset.source_url,
            embed_url: asset.embed_url,
            thumbnail_url: asset.thumbnail_url,
            summary: asset.summary,
            note: asset.note,
            metadata: asset.metadata,
            position: index + 1
          }))
        );
        if (assetsError) throw assetsError;
      }

      if (resolvedAssets[0]) {
        await supabase
          .from("journeys")
          .update({ cover_url: resolvedAssets[0].thumbnail_url ?? null, updated_at: new Date().toISOString() })
          .eq("id", params.id)
          .eq("workspace_id", workspaceId);
      }
    }

    return NextResponse.json({
      id: journey.id,
      shareToken: journey.share_token,
      shareUrl: `/share/${journey.share_token}`,
      journey
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Journey update failed." }, { status: 400 });
  }
}

async function resolveJourneyAssets(
  supabase: ReturnType<typeof createUserSupabaseClient>,
  workspaceId: string,
  assets: NonNullable<JourneyPatchRequest["assets"]>,
  fallbackVideoIds: string[]
) {
  const nextAssets = assets.length ? assets : fallbackVideoIds.map((videoId) => ({ videoId }));
  const videoIds = Array.from(new Set(nextAssets.map((asset) => asset.videoId).filter(Boolean))) as string[];
  const videoMap = new Map<string, any>();

  if (videoIds.length) {
    const { data: videos, error } = await supabase
      .from("videos")
      .select("id,title,source_platform,source_url,embed_url,thumbnail_url,duration_seconds,summary,metadata")
      .eq("workspace_id", workspaceId)
      .in("id", videoIds);
    if (error) throw error;
    for (const video of videos ?? []) videoMap.set(video.id, video);
  }

  return nextAssets.map((asset, index) => {
    if (asset.videoId) {
      const video = videoMap.get(asset.videoId);
      if (!video) throw new Error("One of the selected videos no longer exists.");
      return {
        video_id: video.id,
        asset_type: "video",
        source_platform: video.source_platform ?? "manual",
        title: video.title ?? "Untitled video",
        source_url: video.source_url ?? null,
        embed_url: video.embed_url ?? video.source_url ?? "",
        thumbnail_url: video.thumbnail_url ?? null,
        summary: video.summary ?? null,
        note: asset.note?.trim() || null,
        metadata: video.metadata ?? {},
        position: index + 1
      };
    }

    const normalized = normalizeJourneyEmbed({ url: asset.sourceUrl ?? "", title: asset.title ?? "" });
    return {
      video_id: null,
      asset_type: normalized.assetType,
      source_platform: normalized.sourcePlatform,
      title: normalized.title,
      source_url: normalized.sourceUrl,
      embed_url: normalized.embedUrl,
      thumbnail_url: normalized.thumbnailUrl,
      summary: asset.summary?.trim() || null,
      note: asset.note?.trim() || null,
      metadata: {
        ...normalized.metadata,
        ...(asset.metadata ?? {})
      },
      position: index + 1
    };
  });
}

async function ensureFolder(supabase: ReturnType<typeof createUserSupabaseClient>, workspaceId: string, userId: string, name: string, parentName?: string) {
  let parentId: string | null = null;

  if (parentName) {
    const { data: parent } = await supabase
      .from("journey_folders")
      .upsert({ workspace_id: workspaceId, name: parentName, parent_id: null, created_by: userId }, { onConflict: "workspace_id,parent_id,name" })
      .select("id")
      .single();
    parentId = parent?.id ?? null;
  }

  const { data, error } = await supabase
    .from("journey_folders")
    .upsert({ workspace_id: workspaceId, name, parent_id: parentId, created_by: userId }, { onConflict: "workspace_id,parent_id,name" })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not save journey folder.");
  return data.id as string;
}
