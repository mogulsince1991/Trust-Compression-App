import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { isTrackingEventType, sanitizeCurrency, sanitizeMetadata, sanitizeNumber, sanitizeText, sanitizeTimestamp, sanitizeUrl } from "@/lib/tracking";

type TrackingEventRequest = {
  slug?: string;
  eventType?: string;
  eventLabel?: string | null;
  eventValue?: number | null;
  eventCurrency?: string | null;
  occurredAt?: string | null;
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

    const eventLabel = sanitizeText(body.eventLabel ?? (typeof body.metadata?.label === "string" ? body.metadata.label : null), 160);
    const eventValue = sanitizeNumber(body.eventValue ?? body.metadata?.value);
    const eventCurrency = sanitizeCurrency(body.eventCurrency ?? (typeof body.metadata?.currency === "string" ? body.metadata.currency : null));
    const occurredAt = sanitizeTimestamp(body.occurredAt);
    const trackingTimestamp = occurredAt ?? new Date().toISOString();
    const metadata = sanitizeMetadata({
      ...(body.metadata ?? {}),
      source: "tc.js",
      userAgent: request.headers.get("user-agent")?.slice(0, 240) ?? null,
      tracking: {
        eventLabel,
        eventValue,
        eventCurrency,
        occurredAt: trackingTimestamp
      }
    });

    const visitorId = sanitizeText(body.visitorId, 120);
    let contactId: string | null = null;

    try {
      const identity = extractTrackingIdentity(metadata);
      const contact = await resolveTrackingContact(supabase, link.workspace_id, identity);
      contactId =
        (await upsertTrackingIdentity(supabase, {
          workspaceId: link.workspace_id,
          trackingLinkId: link.id,
          journeyId: link.journey_id || null,
          visitorId,
          eventMetadata: metadata,
          identity,
          contact,
          occurredAt: trackingTimestamp
        })) ??
        contact?.id ??
        null;
    } catch (_identityError) {
      contactId = null;
    }

    const richInsert = await supabase.from("tracking_events").insert({
      workspace_id: link.workspace_id,
      tracking_link_id: link.id,
      journey_id: link.journey_id || null,
      contact_id: contactId,
      event_type: body.eventType,
      event_label: eventLabel,
      event_value: eventValue,
      event_currency: eventCurrency,
      occurred_at: trackingTimestamp,
      visit_id: sanitizeText(body.visitId, 120),
      visitor_id: visitorId,
      session_id: sanitizeText(body.sessionId, 120),
      page_url: sanitizeUrl(body.pageUrl),
      referrer_url: sanitizeUrl(body.referrerUrl),
      metadata: metadata ?? {}
    });

    if (richInsert.error) {
      const legacyInsert = await supabase.from("tracking_events").insert({
        workspace_id: link.workspace_id,
        tracking_link_id: link.id,
        journey_id: link.journey_id || null,
        event_type: body.eventType,
        visit_id: sanitizeText(body.visitId, 120),
        visitor_id: visitorId,
        session_id: sanitizeText(body.sessionId, 120),
        page_url: sanitizeUrl(body.pageUrl),
        referrer_url: sanitizeUrl(body.referrerUrl),
        metadata: metadata ?? {}
      });

      if (legacyInsert.error) return NextResponse.json({ error: legacyInsert.error.message }, { status: 500 });
    }

    try {
      await backfillTrackingEventsContact(supabase, link.workspace_id, visitorId, contactId);
    } catch (_backfillError) {
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not ingest tracking event." }, { status: 400 });
  }
}

function extractTrackingIdentity(metadata: Record<string, unknown> | null | undefined) {
  const contact = asObject(metadata?.contact);

  return {
    contactId: sanitizeText(asString(contact?.id) ?? asString(metadata?.contactId), 120),
    email: sanitizeEmail(asString(metadata?.email) ?? asString(contact?.email)),
    phone: sanitizePhone(asString(metadata?.phone) ?? asString(contact?.phone)),
    name: sanitizeText(asString(metadata?.name) ?? asString(contact?.name), 160),
    company: sanitizeText(asString(metadata?.company) ?? asString(contact?.company), 160),
    externalId: sanitizeText(asString(metadata?.externalId) ?? asString(metadata?.crmExternalId) ?? asString(contact?.externalId), 160),
    crmSource: sanitizeText(asString(metadata?.crmSource) ?? asString(contact?.crmSource), 80)
  };
}

async function resolveTrackingContact(supabase: any, workspaceId: string, identity: ReturnType<typeof extractTrackingIdentity>) {
  const lookups: Array<Promise<any>> = [];

  if (identity.contactId) {
    lookups.push(
      supabase.from("contacts").select("id,email,phone,name,company,crm_source,external_id").eq("workspace_id", workspaceId).eq("id", identity.contactId).maybeSingle()
    );
  }
  if (identity.email) {
    lookups.push(
      supabase.from("contacts").select("id,email,phone,name,company,crm_source,external_id").eq("workspace_id", workspaceId).eq("email", identity.email).maybeSingle()
    );
  }
  if (identity.crmSource && identity.externalId) {
    lookups.push(
      supabase.from("contacts").select("id,email,phone,name,company,crm_source,external_id").eq("workspace_id", workspaceId).eq("crm_source", identity.crmSource).eq("external_id", identity.externalId).maybeSingle()
    );
  }
  if (identity.phone) {
    lookups.push(
      supabase.from("contacts").select("id,email,phone,name,company,crm_source,external_id").eq("workspace_id", workspaceId).eq("phone", identity.phone).maybeSingle()
    );
  }

  for (const lookup of lookups) {
    const { data } = await lookup;
    if (data) {
      return {
        id: sanitizeText(data.id, 120),
        email: sanitizeEmail(data.email),
        phone: sanitizePhone(data.phone),
        name: sanitizeText(data.name, 160),
        company: sanitizeText(data.company, 160),
        externalId: sanitizeText(data.external_id, 160),
        crmSource: sanitizeText(data.crm_source, 80)
      };
    }
  }

  return null;
}

async function upsertTrackingIdentity(
  supabase: any,
  args: {
    workspaceId: string;
    trackingLinkId: string;
    journeyId: string | null;
    visitorId: string | null;
    eventMetadata: Record<string, unknown> | null;
    identity: ReturnType<typeof extractTrackingIdentity>;
    contact: Awaited<ReturnType<typeof resolveTrackingContact>>;
    occurredAt: string;
  }
) {
  if (!args.visitorId) return null;

  const firstTouch = sanitizeMetadata(asObject(args.eventMetadata?.firstTouch));
  const pageContext = sanitizeMetadata({
    pageUrl: asString(args.eventMetadata?.pageUrl),
    path: asString(args.eventMetadata?.path),
    title: asString(args.eventMetadata?.title),
    host: asString(args.eventMetadata?.host),
    referrer: asString(args.eventMetadata?.referrer)
  });

  const identityFields = {
    contact_id: args.contact?.id ?? null,
    email: args.contact?.email ?? args.identity.email,
    phone: args.contact?.phone ?? args.identity.phone,
    name: args.contact?.name ?? args.identity.name,
    company: args.contact?.company ?? args.identity.company,
    external_id: args.contact?.externalId ?? args.identity.externalId,
    crm_source: args.contact?.crmSource ?? args.identity.crmSource
  };

  const { data: existing } = await supabase
    .from("tracking_identities")
    .select("id,contact_id,email,phone,name,company,external_id,crm_source,metadata")
    .eq("workspace_id", args.workspaceId)
    .eq("visitor_id", args.visitorId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("tracking_identities")
      .update({
        contact_id: existing.contact_id ?? identityFields.contact_id,
        email: existing.email ?? identityFields.email,
        phone: existing.phone ?? identityFields.phone,
        name: existing.name ?? identityFields.name,
        company: existing.company ?? identityFields.company,
        external_id: existing.external_id ?? identityFields.external_id,
        crm_source: existing.crm_source ?? identityFields.crm_source,
        last_tracking_link_id: args.trackingLinkId,
        last_journey_id: args.journeyId,
        last_seen_at: args.occurredAt,
        last_touch: firstTouch ?? {},
        metadata: { ...(asObject(existing.metadata) ?? {}), ...(pageContext ?? {}) }
      })
      .eq("id", existing.id);

    return existing.contact_id ?? identityFields.contact_id ?? null;
  }

  await supabase.from("tracking_identities").insert({
    workspace_id: args.workspaceId,
    visitor_id: args.visitorId,
    first_tracking_link_id: args.trackingLinkId,
    last_tracking_link_id: args.trackingLinkId,
    first_journey_id: args.journeyId,
    last_journey_id: args.journeyId,
    first_seen_at: args.occurredAt,
    last_seen_at: args.occurredAt,
    first_touch: firstTouch ?? {},
    last_touch: firstTouch ?? {},
    metadata: pageContext ?? {},
    ...identityFields
  });

  return identityFields.contact_id ?? null;
}

async function backfillTrackingEventsContact(supabase: any, workspaceId: string, visitorId: string | null, contactId: string | null) {
  if (!visitorId || !contactId) return;

  await supabase.from("tracking_events").update({ contact_id: contactId }).eq("workspace_id", workspaceId).eq("visitor_id", visitorId).is("contact_id", null);
}

function sanitizeEmail(value: string | null | undefined) {
  const next = sanitizeText(value, 240)?.toLowerCase() ?? null;
  return next && next.includes("@") ? next : null;
}

function sanitizePhone(value: string | null | undefined) {
  const next = sanitizeText(value, 40);
  if (!next) return null;
  const digits = next.replace(/[^\d+]/g, "");
  return digits.length >= 7 ? digits : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
