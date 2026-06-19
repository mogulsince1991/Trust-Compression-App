import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";
import { buildTrackingSlug, normalizeDestinationUrl } from "@/lib/tracking";

type TrackingLinkRequest = {
  workspaceId?: string;
  title?: string;
  destinationUrl?: string;
  journeyId?: string | null;
};

export async function GET(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in to load tracking links." }, { status: 401 });

    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const { data: membership, error: membershipError } = await supabase.from("workspace_members").select("id").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
    if (!membership) return NextResponse.json({ error: "You do not have access to this workspace." }, { status: 403 });

    const { data: links, error: linksError } = await supabase
      .from("tracking_links")
      .select("id,workspace_id,journey_id,title,slug,destination_url,is_active,metadata,created_at,updated_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (linksError) return NextResponse.json({ error: linksError.message }, { status: 500 });

    const richEventsResult = await supabase
      .from("tracking_events")
      .select("id,tracking_link_id,journey_id,contact_id,event_type,event_label,event_value,event_currency,occurred_at,visit_id,visitor_id,session_id,page_url,referrer_url,metadata,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(2000);

    const fallbackEventsResult = richEventsResult.error
      ? await supabase
          .from("tracking_events")
          .select("id,tracking_link_id,journey_id,event_type,visit_id,visitor_id,session_id,page_url,referrer_url,metadata,created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(2000)
      : null;

    const events = richEventsResult.data ?? fallbackEventsResult?.data ?? [];
    const eventsError = richEventsResult.error && fallbackEventsResult?.error ? fallbackEventsResult.error : null;
    if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });

    const richIdentitiesResult = await supabase
      .from("tracking_identities")
      .select("id,visitor_id,contact_id,email,phone,name,company,external_id,crm_source,first_tracking_link_id,last_tracking_link_id,first_journey_id,last_journey_id,first_seen_at,last_seen_at,first_touch,last_touch,metadata,created_at,updated_at")
      .eq("workspace_id", workspaceId)
      .order("last_seen_at", { ascending: false })
      .limit(1000);

    const identities = richIdentitiesResult.error ? [] : richIdentitiesResult.data ?? [];
    const origin = url.origin;

    return NextResponse.json({
      links: (links ?? []).map((link) => ({
        id: link.id,
        workspaceId: link.workspace_id,
        journeyId: link.journey_id,
        title: link.title,
        slug: link.slug,
        destinationUrl: link.destination_url,
        trackingUrl: `${origin}/t/${link.slug}`,
        isActive: link.is_active,
        metadata: link.metadata ?? {},
        createdAt: link.created_at,
        updatedAt: link.updated_at
      })),
      events: (events ?? []).map((event) => ({
        id: event.id,
        trackingLinkId: event.tracking_link_id,
        journeyId: event.journey_id,
        contactId: event.contact_id,
        eventType: event.event_type,
        eventLabel: event.event_label ?? (typeof event.metadata?.tracking?.eventLabel === "string" ? event.metadata.tracking.eventLabel : null),
        eventValue: typeof event.event_value === "number" ? event.event_value : typeof event.metadata?.tracking?.eventValue === "number" ? event.metadata.tracking.eventValue : null,
        eventCurrency: event.event_currency ?? (typeof event.metadata?.tracking?.eventCurrency === "string" ? event.metadata.tracking.eventCurrency : null),
        visitId: event.visit_id,
        visitorId: event.visitor_id,
        sessionId: event.session_id,
        pageUrl: event.page_url,
        referrerUrl: event.referrer_url,
        occurredAt: event.occurred_at ?? (typeof event.metadata?.tracking?.occurredAt === "string" ? event.metadata.tracking.occurredAt : event.created_at),
        metadata: event.metadata ?? {},
        createdAt: event.created_at
      })),
      identities: (identities ?? []).map((identity) => ({
        id: identity.id,
        visitorId: identity.visitor_id,
        contactId: identity.contact_id,
        email: identity.email,
        phone: identity.phone,
        name: identity.name,
        company: identity.company,
        externalId: identity.external_id,
        crmSource: identity.crm_source,
        firstTrackingLinkId: identity.first_tracking_link_id,
        lastTrackingLinkId: identity.last_tracking_link_id,
        firstJourneyId: identity.first_journey_id,
        lastJourneyId: identity.last_journey_id,
        firstSeenAt: identity.first_seen_at,
        lastSeenAt: identity.last_seen_at,
        firstTouch: identity.first_touch ?? {},
        lastTouch: identity.last_touch ?? {},
        metadata: identity.metadata ?? {},
        createdAt: identity.created_at,
        updatedAt: identity.updated_at
      }))
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load tracking links." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in before creating a tracking link." }, { status: 401 });

    const body = (await request.json()) as TrackingLinkRequest;
    const workspaceId = body.workspaceId?.trim();
    const title = body.title?.trim();
    const destinationUrl = body.destinationUrl?.trim();

    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });
    if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
    if (!destinationUrl) return NextResponse.json({ error: "Destination URL is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const { data: membership, error: membershipError } = await supabase.from("workspace_members").select("id").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
    if (!membership) return NextResponse.json({ error: "You do not have access to this workspace." }, { status: 403 });

    const normalizedDestinationUrl = normalizeDestinationUrl(destinationUrl);
    const slug = buildTrackingSlug(title);
    const journeyId = body.journeyId?.trim() || null;

    if (journeyId) {
      const { data: journey, error: journeyError } = await supabase.from("journeys").select("id").eq("id", journeyId).eq("workspace_id", workspaceId).maybeSingle();
      if (journeyError) return NextResponse.json({ error: journeyError.message }, { status: 500 });
      if (!journey) return NextResponse.json({ error: "Journey was not found in this workspace." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("tracking_links")
      .insert({
        workspace_id: workspaceId,
        journey_id: journeyId,
        title,
        slug,
        destination_url: normalizedDestinationUrl,
        created_by: user.id
      })
      .select("id,workspace_id,journey_id,title,slug,destination_url,is_active,metadata,created_at,updated_at")
      .single();

    if (error || !data) {
      const message = error?.code === "23505" ? "That tracking slug already exists. Try again." : error?.message ?? "Could not create the tracking link.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const origin = new URL(request.url).origin;
    return NextResponse.json({
      link: {
        id: data.id,
        workspaceId: data.workspace_id,
        journeyId: data.journey_id,
        title: data.title,
        slug: data.slug,
        destinationUrl: data.destination_url,
        trackingUrl: `${origin}/t/${data.slug}`,
        isActive: data.is_active,
        metadata: data.metadata ?? {},
        createdAt: data.created_at,
        updatedAt: data.updated_at
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create the tracking link." }, { status: 400 });
  }
}
