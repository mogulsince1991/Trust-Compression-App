import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { appendTrackingParams, sanitizeMetadata, sanitizeSearchParams } from "@/lib/tracking";

type RouteContext = {
  params: { slug: string };
};

export async function GET(request: Request, { params }: RouteContext) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });

  const slug = params.slug?.trim();
  if (!slug) return NextResponse.json({ error: "Tracking slug is required." }, { status: 400 });

  const { data: link, error } = await supabase
    .from("tracking_links")
    .select("id,workspace_id,journey_id,destination_url,is_active,slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!link) return NextResponse.json({ error: "Tracking link was not found." }, { status: 404 });

  const requestUrl = new URL(request.url);
  const visitId = crypto.randomUUID();

  const metadata = sanitizeMetadata({
    source: "redirect",
    query: sanitizeSearchParams(requestUrl),
    userAgent: request.headers.get("user-agent")?.slice(0, 240) ?? null,
    tracking: {
      eventLabel: "Tracked redirect",
      occurredAt: new Date().toISOString()
    }
  });
  const trackingMetadata = metadata?.tracking as Record<string, unknown> | undefined;
  const occurredAt = typeof trackingMetadata?.occurredAt === "string" ? trackingMetadata.occurredAt : new Date().toISOString();

  const richInsert = await supabase.from("tracking_events").insert({
    workspace_id: link.workspace_id,
    tracking_link_id: link.id,
    journey_id: link.journey_id,
    event_type: "redirect",
    event_label: "Tracked redirect",
    occurred_at: occurredAt,
    visit_id: visitId,
    page_url: requestUrl.toString().slice(0, 1800),
    referrer_url: request.headers.get("referer")?.slice(0, 1800) ?? null,
    metadata: metadata ?? {}
  });

  if (richInsert.error) {
    const legacyInsert = await supabase.from("tracking_events").insert({
      workspace_id: link.workspace_id,
      tracking_link_id: link.id,
      journey_id: link.journey_id,
      event_type: "redirect",
      visit_id: visitId,
      page_url: requestUrl.toString().slice(0, 1800),
      referrer_url: request.headers.get("referer")?.slice(0, 1800) ?? null,
      metadata: metadata ?? {}
    });

    if (legacyInsert.error) return NextResponse.json({ error: legacyInsert.error.message }, { status: 500 });
  }

  const destination = appendTrackingParams(link.destination_url, {
    slug: link.slug,
    visitId,
    journeyId: link.journey_id
  });

  return NextResponse.redirect(destination, { status: 302 });
}
