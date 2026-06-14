import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";

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

    if (body.videoIds) {
      const videoIds = Array.from(new Set(body.videoIds)).filter(Boolean);
      await supabase.from("journey_videos").delete().eq("journey_id", params.id);
      if (videoIds.length) {
        const { error: videosError } = await supabase.from("journey_videos").insert(videoIds.map((videoId, index) => ({ journey_id: params.id, video_id: videoId, position: index + 1 })));
        if (videosError) throw videosError;
      }
    }

    return NextResponse.json({ journey, shareUrl: `/share/${journey.share_token}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Journey update failed." }, { status: 400 });
  }
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
