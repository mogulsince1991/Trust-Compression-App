import { NextResponse } from "next/server";
import { createServiceSupabaseClient, createUserSupabaseClient } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in to manage the archive." }, { status: 401 });

    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim();
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

    const [archivedVideosResult, archivedJourneysResult, activeJourneysResult, foldersResult, contactsResult, sendsResult] = await Promise.all([
      dataSupabase
        .from("videos")
        .select("id,title,source_platform,source_url,embed_url,thumbnail_url,duration_seconds,summary,sales_category,funnel_stage,proof_type,published_at,created_at,deleted_at")
        .eq("workspace_id", workspaceId)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(80),
      dataSupabase
        .from("journeys")
        .select("id,title,heading,description,cta_label,cta_url,share_token,folder_id,created_at,published_at,is_public,deleted_at,journey_assets(id,library_asset_id,video_id,asset_type,source_platform,title,source_url,embed_url,thumbnail_url,summary,note,position,metadata,videos(id,title,thumbnail_url,source_platform,duration_seconds))")
        .eq("workspace_id", workspaceId)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(80),
      dataSupabase
        .from("journeys")
        .select("id,title,heading,description,cta_label,cta_url,share_token,folder_id,created_at,published_at,is_public,deleted_at,journey_assets(id,library_asset_id,video_id,asset_type,source_platform,title,source_url,embed_url,thumbnail_url,summary,note,position,metadata,videos(id,title,thumbnail_url,source_platform,duration_seconds))")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(80),
      dataSupabase.from("journey_folders").select("id,name,parent_id").eq("workspace_id", workspaceId).order("name", { ascending: true }),
      dataSupabase.from("contacts").select("id,name,email,company,phone").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(200),
      dataSupabase
        .from("journey_sends")
        .select("id,journey_id,contact_id,share_token,created_at,contacts(id,name,email,company)")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(300)
    ]);

    if (archivedVideosResult.error) return NextResponse.json({ error: archivedVideosResult.error.message }, { status: 500 });
    if (archivedJourneysResult.error) return NextResponse.json({ error: archivedJourneysResult.error.message }, { status: 500 });
    if (activeJourneysResult.error) return NextResponse.json({ error: activeJourneysResult.error.message }, { status: 500 });

    const origin = url.origin;

    return NextResponse.json({
      archivedVideos: (archivedVideosResult.data ?? []).map(mapVideo),
      archivedJourneys: (archivedJourneysResult.data ?? []).map((journey: any) => mapJourney(journey, origin)),
      activeJourneys: (activeJourneysResult.data ?? []).map((journey: any) => mapJourney(journey, origin)),
      folders: foldersResult.error ? [] : foldersResult.data ?? [],
      contacts: contactsResult.error ? [] : contactsResult.data ?? [],
      sends: sendsResult.error
        ? []
        : (sendsResult.data ?? []).map((send: any) => ({
            id: send.id,
            journeyId: send.journey_id,
            contactId: send.contact_id,
            shareToken: send.share_token,
            shareUrl: `${origin}/share/${send.share_token}`,
            createdAt: send.created_at,
            contact: send.contacts
              ? {
                  id: send.contacts.id,
                  name: send.contacts.name,
                  email: send.contacts.email,
                  company: send.contacts.company
                }
              : null
          }))
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load archive." }, { status: 400 });
  }
}

function mapVideo(video: any) {
  return {
    id: video.id,
    title: video.title,
    sourcePlatform: video.source_platform,
    sourceUrl: video.source_url,
    embedUrl: video.embed_url,
    thumbnailUrl: video.thumbnail_url,
    durationSeconds: video.duration_seconds,
    summary: video.summary,
    salesCategory: video.sales_category,
    funnelStage: video.funnel_stage,
    proofType: video.proof_type,
    publishedAt: video.published_at,
    createdAt: video.created_at,
    archivedAt: video.deleted_at
  };
}

function mapJourney(journey: any, origin: string) {
  const items = [...(journey.journey_assets ?? [])].sort((a, b) => a.position - b.position);
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
    assets: items.map((item) => ({
      id: item.id,
      videoId: item.video_id ?? null,
      assetType: item.asset_type,
      sourcePlatform: item.source_platform,
      title: item.title,
      sourceUrl: item.source_url ?? null,
      embedUrl: item.embed_url ?? null,
      thumbnailUrl: item.thumbnail_url ?? item.videos?.thumbnail_url ?? null,
      durationSeconds: item.videos?.duration_seconds ?? null,
      summary: item.summary ?? null,
      note: item.note ?? null,
      position: item.position,
      metadata: item.metadata ?? null
    })),
    videoIds: items.map((item) => item.video_id).filter(Boolean),
    videos: items
      .filter((item) => item.video_id)
      .map((item) => ({
        id: item.video_id,
        title: item.videos?.title ?? item.title ?? "Untitled video",
        thumbnailUrl: item.videos?.thumbnail_url ?? item.thumbnail_url ?? null,
        sourcePlatform: item.videos?.source_platform ?? item.source_platform ?? null,
        durationSeconds: item.videos?.duration_seconds ?? null
      }))
  };
}
