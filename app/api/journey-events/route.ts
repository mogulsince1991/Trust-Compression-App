import { NextResponse } from "next/server";
import { createPublicSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase";

type JourneyEventRequest = {
  journeyId?: string;
  videoId?: string;
  eventType?: string;
  viewerId?: string;
  activeIndex?: number;
};

export async function POST(request: Request) {
  try {
    const supabase = createServiceSupabaseClient() ?? createPublicSupabaseClient();
    if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

    const body = (await request.json()) as JourneyEventRequest;
    const journeyId = body.journeyId?.trim();
    const videoId = body.videoId?.trim();
    const eventType = body.eventType?.trim() || "video_active";

    if (!journeyId) return NextResponse.json({ error: "Journey is required." }, { status: 400 });
    if (!videoId) return NextResponse.json({ error: "Video is required." }, { status: 400 });

    const { error } = await supabase.from("journey_views").insert({
      journey_id: journeyId,
      video_id: videoId,
      event_type: eventType,
      viewer_label: body.viewerId?.slice(0, 80) ?? null,
      metadata: {
        viewerId: body.viewerId ?? null,
        activeIndex: body.activeIndex ?? null,
        userAgent: request.headers.get("user-agent")?.slice(0, 240) ?? null
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
