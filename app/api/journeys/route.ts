import { NextResponse } from "next/server";
import { createServiceSupabaseClient, createUserSupabaseClient } from "@/lib/supabase";
import { normalizeJourneyEmbed, type JourneyAssetType } from "@/lib/journey-embeds";

type JourneyRequest = {
  workspaceId?: string;
  title?: string;
  heading?: string;
  description?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  folderName?: string;
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
};

export async function GET(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in to load journeys." }, { status: 401 });

    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim();
    const archived = url.searchParams.get("archived") === "true";
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const userSupabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await userSupabase.auth.getUser();

    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const serviceSupabase = createServiceSupabaseClient();
    const dataSupabase = serviceSupabase ?? userSupabase;

    if (serviceSupabase) {
      const { data: membership, error: membershipError } = await serviceSupabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
      if (!membership) return NextResponse.json({ error: "You do not have access to this workspace." }, { status: 403 });
    }

    let query = dataSupabase
      .from("journeys")
      .select("id,title,heading,description,cta_label,cta_url,share_token,folder_id,created_at,published_at,is_public,deleted_at,journey_assets(id,video_id,asset_type,source_platform,title,source_url,embed_url,thumbnail_url,summary,note,position,metadata),journey_videos(video_id,position)")
      .eq("workspace_id", workspaceId)
      .order(archived ? "deleted_at" : "created_at", { ascending: false })
      .limit(80);

    query = archived ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: folders } = await dataSupabase.from("journey_folders").select("id,name,parent_id").eq("workspace_id", workspaceId).order("name", { ascending: true });
    const origin = url.origin;
    const journeys = (data ?? []).map((journey: any) => {
      const assets = mapJourneyAssets(journey);
      return {
        id: journey.id,
        title: journey.title,
        heading: journey.heading,
        description: journey.description,
        ctaLabel: journey.cta_label,
        ctaUrl: journey.cta_url,
        folderId: journey.folder_id,
        shareToken: journey.share_token,
        shareUrl: `${origin}/share/${journey.share_token}`,
        createdAt: journey.created_at,
        publishedAt: journey.published_at,
        archivedAt: journey.deleted_at ?? null,
        isPublic: journey.is_public,
        assets,
        videoIds: assets.map((item) => item.videoId).filter(Boolean)
      };
    });

    return NextResponse.json({ journeys, folders: folders ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load journeys." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in before publishing a journey." }, { status: 401 });

    const body = (await request.json()) as JourneyRequest;
    const workspaceId = body.workspaceId?.trim();
    const videoIds = Array.from(new Set(body.videoIds ?? [])).filter(Boolean);
    const requestedAssets = Array.isArray(body.assets) ? body.assets : [];

    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });
    if (!requestedAssets.length && !videoIds.length) return NextResponse.json({ error: "Add at least one asset to publish a journey." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const folderId = body.folderName?.trim() ? await ensureFolder(supabase, workspaceId, user.id, body.folderName.trim()) : null;
    const resolvedAssets = await resolveJourneyAssets(supabase, workspaceId, requestedAssets, videoIds);
    const firstAsset = resolvedAssets[0] ?? null;

    const { data: journey, error: journeyError } = await supabase
      .from("journeys")
      .insert({
        workspace_id: workspaceId,
        title: body.title?.trim() || "Untitled journey",
        heading: body.heading?.trim() || body.title?.trim() || "A focused proof journey",
        description: body.description?.trim() || null,
        cta_label: body.ctaLabel?.trim() || "Continue the conversation",
        cta_url: body.ctaUrl?.trim() || null,
        folder_id: folderId,
        cover_url: firstAsset?.thumbnail_url ?? null,
        is_public: true,
        published_at: new Date().toISOString(),
        created_by: user.id
      })
      .select("id,share_token")
      .single();

    if (journeyError || !journey) return NextResponse.json({ error: journeyError?.message ?? "Could not create the journey." }, { status: 500 });

    const { error: assetsError } = await supabase.from("journey_assets").insert(
      resolvedAssets.map((asset, index) => ({
        journey_id: journey.id,
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

    return NextResponse.json({ id: journey.id, shareToken: journey.share_token, shareUrl: `/share/${journey.share_token}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Journey publish failed." }, { status: 400 });
  }
}

function mapJourneyAssets(journey: any) {
  const assetRows = Array.isArray(journey.journey_assets) ? [...journey.journey_assets].sort((a, b) => a.position - b.position) : [];
  if (assetRows.length) {
    return assetRows.map((item) => ({
      id: item.id,
      videoId: item.video_id ?? null,
      assetType: item.asset_type,
      sourcePlatform: item.source_platform,
      title: item.title,
      sourceUrl: item.source_url ?? null,
      embedUrl: item.embed_url ?? null,
      thumbnailUrl: item.thumbnail_url ?? null,
      durationSeconds: null,
      summary: item.summary ?? null,
      note: item.note ?? null,
      position: item.position,
      metadata: item.metadata ?? null
    }));
  }

  return [...(journey.journey_videos ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((item, index) => ({
      id: `${journey.id}:${item.video_id}`,
      videoId: item.video_id,
      assetType: "video",
      sourcePlatform: "youtube",
      title: "Video",
      sourceUrl: null,
      embedUrl: null,
      thumbnailUrl: null,
      durationSeconds: null,
      summary: null,
      note: null,
      position: item.position ?? index + 1,
      metadata: null
    }));
}

async function resolveJourneyAssets(
  supabase: ReturnType<typeof createUserSupabaseClient>,
  workspaceId: string,
  assets: NonNullable<JourneyRequest["assets"]>,
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

async function ensureFolder(supabase: ReturnType<typeof createUserSupabaseClient>, workspaceId: string, userId: string, name: string) {
  const { data: existing } = await supabase.from("journey_folders").select("id").eq("workspace_id", workspaceId).is("parent_id", null).eq("name", name).maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase.from("journey_folders").insert({ workspace_id: workspaceId, name, parent_id: null, created_by: userId }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Could not save journey folder.");
  return data.id as string;
}
