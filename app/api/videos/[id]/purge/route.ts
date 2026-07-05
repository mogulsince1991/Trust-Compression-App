import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";

type RouteContext = { params: { id: string } };
type PurgeRequest = { workspaceId?: string };

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in before deleting videos." }, { status: 401 });

    const body = (await request.json()) as PurgeRequest;
    const workspaceId = body.workspaceId?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const { data: archivedVideo, error: lookupError } = await supabase
      .from("videos")
      .select("id")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .not("deleted_at", "is", null)
      .single();

    if (lookupError || !archivedVideo) return NextResponse.json({ error: "Archive the video before permanently deleting it." }, { status: 409 });

    await supabase.from("journey_assets").delete().eq("video_id", params.id);
    await supabase.from("journey_videos").delete().eq("video_id", params.id);
    await supabase.from("video_source_links").delete().eq("video_id", params.id);
    await supabase.from("duplicate_candidates").delete().or(`primary_video_id.eq.${params.id},candidate_video_id.eq.${params.id}`);

    const { error } = await supabase.from("videos").delete().eq("id", params.id).eq("workspace_id", workspaceId);
    if (error) {
      return NextResponse.json(
        { error: "This video still has related analytics or records. Keep it archived if you want to preserve reporting history.", detail: error.message },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Video delete failed." }, { status: 400 });
  }
}
