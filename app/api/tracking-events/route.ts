import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { isTrackingEventType, sanitizeMetadata, sanitizeText, sanitizeUrl } from "@/lib/tracking";

type TrackingEventRequest = {
  slug?: string;
  eventType?: string;
  journeyId?: string | null;
  visitId?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;
  pageUrl?: string | null;
  referrerUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export async function POST(request: Request) {
  try {
    const supabase = createServiceSupabaseClient();
    if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });

    const body = (await request.json()) as TrackingEventRequest;
    const slug = body.slug?.trim();
    if (!slug) return NextResponse.json({ error: "Tracking slug is required." }, { status: 400 });
    if (!isTrackingEventType(body.eventType) || body.eventType === "redirect") {
      return NextResponse.json({ error: "Event type is not allowed." }, { status: 400 });
    }

    const { data: link, error: linkError } = await supabase
      .from("tracking_links")
      .select("id,workspace_id,journey_id,is_active")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });
    if (!link) return NextResponse.json({ error: "Tracking link was not found." }, { status: 404 });

    const metadata = sanitizeMetadata({
      ...(body.metadata ?? {}),
      source: "tc.js",
      userAgent: request.headers.get("user-agent")?.slice(0, 240) ?? null
    });

    const { error } = await supabase.from("tracking_events").insert({
      workspace_id: link.workspace_id,
      tracking_link_id: link.id,
      journey_id: link.journey_id || null,
      event_type: body.eventType,
      visit_id: sanitizeText(body.visitId, 120),
      visitor_id: sanitizeText(body.visitorId, 120),
      session_id: sanitizeText(body.sessionId, 120),
      page_url: sanitizeUrl(body.pageUrl),
      referrer_url: sanitizeUrl(body.referrerUrl),
      metadata: metadata ?? {}
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not ingest tracking event." }, { status: 400 });
  }
}
