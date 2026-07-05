import { NextResponse } from "next/server";
import { createPublicSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase";

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
    const supabase = createServiceSupabaseClient() ?? createPublicSupabaseClient();
    if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

    const body = (await request.json()) as JourneyEventRequest;
    const journeyId = body.journeyId?.trim();
    const videoId = typeof body.videoId === "string" ? body.videoId.trim() : null;
    const assetId = typeof body.assetId === "string" ? body.assetId.trim() : null;
    const eventType = allowedEvents.has(body.eventType ?? "") ? body.eventType : "opened";

    if (!journeyId) return NextResponse.json({ error: "Journey is required." }, { status: 400 });
    if (eventType !== "opened" && eventType !== "cta_clicked" && !assetId && !videoId) return NextResponse.json({ error: "Asset is required." }, { status: 400 });

    const { error } = await supabase.from("journey_views").insert({
      journey_id: journeyId,
      video_id: videoId,
      asset_id: assetId,
      event_type: eventType,
      viewer_label: body.viewerId?.slice(0, 80) ?? null,
      metadata: {
        ...(body.metadata ?? {}),
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
