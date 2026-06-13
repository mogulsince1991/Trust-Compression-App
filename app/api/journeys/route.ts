import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";

type JourneyRequest = {
  workspaceId?: string;
  title?: string;
  heading?: string;
  description?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  videoIds?: string[];
};

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

    const { data: firstVideo } = await supabase
      .from("videos")
      .select("thumbnail_url")
      .eq("workspace_id", workspaceId)
      .eq("id", videoIds[0])
      .maybeSingle();

    const { data: journey, error: journeyError } = await supabase
      .from("journeys")
      .insert({
        workspace_id: workspaceId,
        title: body.title?.trim() || "Untitled journey",
        heading: body.heading?.trim() || body.title?.trim() || "A focused proof journey",
        description: body.description?.trim() || null,
        cta_label: body.ctaLabel?.trim() || "Continue the conversation",
        cta_url: body.ctaUrl?.trim() || null,
        cover_url: firstVideo?.thumbnail_url ?? null,
        is_public: true,
        published_at: new Date().toISOString(),
        created_by: user.id
      })
      .select("id,share_token")
      .single();

    if (journeyError || !journey) {
      return NextResponse.json({ error: journeyError?.message ?? "Could not create the journey." }, { status: 500 });
    }

    const rows = videoIds.map((videoId, index) => ({
      journey_id: journey.id,
      video_id: videoId,
      position: index + 1
    }));

    const { error: videosError } = await supabase.from("journey_videos").insert(rows);
    if (videosError) throw videosError;

    return NextResponse.json({
      id: journey.id,
      shareToken: journey.share_token,
      shareUrl: `/share/${journey.share_token}`
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Journey publish failed." }, { status: 400 });
  }
}
