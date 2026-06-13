import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";
import { importYouTubeSource, parseSourceUrl } from "@/lib/source-import";
import { classifyVideo } from "@/lib/smart-organize";

type ImportRequest = {
  workspaceId?: string;
  sourceUrl?: string;
};

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "Sign in before importing sources." }, { status: 401 });
    }

    const body = (await request.json()) as ImportRequest;
    const workspaceId = body.workspaceId?.trim();
    const sourceUrl = body.sourceUrl?.trim();

    if (!workspaceId || !sourceUrl) {
      return NextResponse.json({ error: "Workspace and source URL are required." }, { status: 400 });
    }

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });
    }

    const parsed = parseSourceUrl(sourceUrl);
    const apiKey = process.env.YOUTUBE_API_KEY;
    const importedVideos = await importYouTubeSource(parsed, apiKey);
    const importMode = String(importedVideos[0]?.metadata.importMode ?? (apiKey ? "youtube_api" : "unknown"));

    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .insert({
        workspace_id: workspaceId,
        platform: parsed.platform,
        account_label: sourceLabel(parsed, importedVideos[0]?.channelTitle),
        status: "syncing",
        metadata: {
          sourceUrl,
          canonicalUrl: parsed.canonicalUrl,
          kind: parsed.kind,
          importMode,
          requiresApiKeyForBulk: parsed.kind === "youtube_playlist" && !apiKey
        }
      })
      .select("id")
      .single();

    if (sourceError || !source) {
      return NextResponse.json({ error: sourceError?.message ?? "Could not save the source." }, { status: 500 });
    }

    let inserted = 0;
    let updated = 0;

    for (const video of importedVideos) {
      const smart = classifyVideo({
        title: video.title,
        summary: video.description,
        tags: Array.isArray(video.metadata.tags) ? (video.metadata.tags as string[]) : []
      });

      const { data: existing } = await supabase
        .from("videos")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("source_platform", parsed.platform)
        .eq("external_id", video.externalId)
        .maybeSingle();

      const payload = {
        workspace_id: workspaceId,
        source_id: source.id,
        external_id: video.externalId,
        title: video.title,
        source_platform: parsed.platform,
        source_url: video.sourceUrl,
        embed_url: video.embedUrl,
        thumbnail_url: video.thumbnailUrl,
        duration_seconds: video.durationSeconds,
        summary: video.description?.slice(0, 500) ?? null,
        proof_type: smart.category,
        buying_stage: smart.stage,
        sales_category: smart.category,
        funnel_stage: smart.stage,
        transcript_status: video.metadata.captionAvailable ? "available" : "pending",
        tags: Array.from(new Set(["YouTube", ...smart.tags])),
        published_at: video.publishedAt,
        metadata: {
          ...video.metadata,
          channelTitle: video.channelTitle,
          sourceUrl,
          salesCategory: smart.category,
          funnelStage: smart.stage
        },
        created_by: user.id,
        updated_at: new Date().toISOString()
      };

      if (existing?.id) {
        const { error } = await supabase.from("videos").update(payload).eq("id", existing.id);
        if (error) throw error;
        updated += 1;
      } else {
        const { error } = await supabase.from("videos").insert(payload);
        if (error) throw error;
        inserted += 1;
      }
    }

    await supabase
      .from("sources")
      .update({
        status: "connected",
        last_synced_at: new Date().toISOString(),
        metadata: {
          sourceUrl,
          canonicalUrl: parsed.canonicalUrl,
          kind: parsed.kind,
          importMode,
          imported: inserted,
          updated
        }
      })
      .eq("id", source.id);

    return NextResponse.json({
      sourceId: source.id,
      imported: inserted,
      updated,
      total: importedVideos.length,
      importMode
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Source import failed." }, { status: 400 });
  }
}

function sourceLabel(parsed: ReturnType<typeof parseSourceUrl>, channelTitle?: string | null) {
  if (channelTitle) return channelTitle;
  if (parsed.kind === "youtube_video") return "YouTube video";
  if (parsed.kind === "youtube_playlist") return "YouTube playlist";
  return parsed.handle ? `YouTube @${parsed.handle}` : "YouTube channel";
}
