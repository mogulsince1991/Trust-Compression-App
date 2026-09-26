import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase";

import { analyticsExclusion } from "@/lib/server/analytics-exclusion";

type JourneyEventRequest = {
  journeyId?: string;
  videoId?: string | null;
  assetId?: string | null;
  eventType?: string;
  viewerId?: string;
  activeIndex?: number;
  metadata?: Record<string, unknown>;
};

const allowedEvents = new Set(["opened", "video_started", "video_completed", "video_progress", "asset_started", "asset_completed", "asset_progress", "cta_clicked"]);

export async function POST(request: Request) {
  try {
    const supabase = createServiceSupabaseClient();
    if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

    const body = (await request.json()) as JourneyEventRequest;
    const journeyId = body.journeyId?.trim();
    const videoId = typeof body.videoId === "string" ? body.videoId.trim() : null;
    const assetId = typeof body.assetId === "string" ? body.assetId.trim() : null;
    if (!allowedEvents.has(body.eventType ?? "")) return NextResponse.json({ error: "Invalid event type." }, { status: 400 });
    const eventType = body.eventType;

    if (!journeyId) return NextResponse.json({ error: "Journey is required." }, { status: 400 });
    if (eventType !== "opened" && eventType !== "cta_clicked" && !assetId && !videoId) return NextResponse.json({ error: "Asset is required." }, { status: 400 });

    const { data: journey, error: journeyError } = await supabase.from("journeys").select("workspace_id,is_public,deleted_at").eq("id", journeyId).maybeSingle();
    if (journeyError) throw journeyError;
    if (!journey?.is_public || journey.deleted_at) return NextResponse.json({ error: "Journey unavailable." }, { status: 404 });
    const exclusionReason = await analyticsExclusion(request, journey.workspace_id, body.metadata?.browserExcluded === true);
    if (assetId || videoId) {
      let query = supabase.from("journey_assets").select("video_id,asset_type,source_platform,embed_url").eq("journey_id", journeyId);
      query = assetId ? query.eq("id", assetId) : query.eq("video_id", videoId);
      const { data: asset, error: assetError } = await query.limit(1).maybeSingle();
      if (assetError) throw assetError;
      if (!asset) return NextResponse.json({ error: "Asset is not in this journey." }, { status: 400 });
      if (videoId && asset.video_id !== videoId) return NextResponse.json({ error: "Video does not match asset." }, { status: 400 });
      if (eventType !== "opened" && eventType !== "cta_clicked") {
        const host = new URL(asset.embed_url).hostname;
        const measured = ["youtube.com", "www.youtube.com", "www.youtube-nocookie.com", "player.vimeo.com"].includes(host) || (asset.asset_type === "video" && /\.(mp4|webm|mov)(\?|$)/i.test(asset.embed_url));
        if (!measured || host === "drive.google.com") return NextResponse.json({ error: "This player does not expose verified playback events." }, { status: 400 });
      }
    }

    const { error } = await supabase.from("journey_views").insert({
      journey_id: journeyId,
      video_id: videoId,
      asset_id: assetId,
      event_type: eventType,
      viewer_label: body.viewerId?.slice(0, 80) ?? null,
      metadata: {
        ...(body.metadata ?? {}),
        excluded: !!exclusionReason,
        exclusionReason,
        viewerId: body.viewerId ?? body.metadata?.viewerId ?? null,
        activeIndex: body.activeIndex ?? body.metadata?.activeIndex ?? null,
        userAgent: request.headers.get("user-agent")?.slice(0, 240) ?? body.metadata?.userAgent ?? null
      }
    });

    if (error) {
      console.error("journey event insert failed", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("journey event tracking failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not track journey event." }, { status: 400 });
  }
}
