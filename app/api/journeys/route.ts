import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";

type JourneyRequest = {
  workspaceId?: string;
  title?: string;
  heading?: string;
  description?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  folderName?: string;
  videoIds?: string[];
};

export async function GET(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in to load journeys." }, { status: 401 });

    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const { data, error } = await supabase
      .from("journeys")
      .select("id,title,heading,description,cta_label,cta_url,share_token,folder_id,created_at,published_at,is_public,journey_videos(video_id,position)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: folders } = await supabase.from("journey_folders").select("id,name,parent_id").eq("workspace_id", workspaceId).order("name", { ascending: true });
    const origin = url.origin;
    const journeys = (data ?? []).map((journey: any) => ({
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
      isPublic: journey.is_public,
      videoIds: [...(journey.journey_videos ?? [])].sort((a, b) => a.position - b.position).map((item) => item.video_id)
    }));

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

    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });
    if (!videoIds.length) return NextResponse.json({ error: "Add at least one video to publish a journey." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const folderId = body.folderName?.trim() ? await ensureFolder(supabase, workspaceId, user.id, body.folderName.trim()) : null;
    const { data: firstVideo } = await supabase.from("videos").select("thumbnail_url").eq("workspace_id", workspaceId).eq("id", videoIds[0]).maybeSingle();

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
        cover_url: firstVideo?.thumbnail_url ?? null,
        is_public: true,
        published_at: new Date().toISOString(),
        created_by: user.id
      })
      .select("id,share_token")
      .single();

    if (journeyError || !journey) return NextResponse.json({ error: journeyError?.message ?? "Could not create the journey." }, { status: 500 });

    const rows = videoIds.map((videoId, index) => ({ journey_id: journey.id, video_id: videoId, position: index + 1 }));
    const { error: videosError } = await supabase.from("journey_videos").insert(rows);
    if (videosError) throw videosError;

    return NextResponse.json({ id: journey.id, shareToken: journey.share_token, shareUrl: `/share/${journey.share_token}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Journey publish failed." }, { status: 400 });
  }
}

async function ensureFolder(supabase: ReturnType<typeof createUserSupabaseClient>, workspaceId: string, userId: string, name: string) {
  const { data: existing } = await supabase.from("journey_folders").select("id").eq("workspace_id", workspaceId).is("parent_id", null).eq("name", name).maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase.from("journey_folders").insert({ workspace_id: workspaceId, name, parent_id: null, created_by: userId }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Could not save journey folder.");
  return data.id as string;
}
