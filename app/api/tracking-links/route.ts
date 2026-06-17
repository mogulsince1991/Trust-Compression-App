import { NextResponse } from 'next/server';
import { createUserSupabaseClient } from '@/lib/supabase';
import { buildTrackingSlug, normalizeDestinationUrl } from '@/lib/tracking';

type TrackingLinkRequest = {
  workspaceId?: string;
  title?: string;
  destinationUrl?: string;
  journeyId?: string | null;
};

type TrackingLinkSummary = {
  linkId: string;
  title: string;
  redirects: number;
  pageViews: number;
  ctas: number;
  uniqueVisits: number;
  uniqueVisitors: number;
  lastTouch: string | null;
};

function summarizeTrackingEvents(linkId: string, events: Array<{ id: string; tracking_link_id: string; event_type: string; visit_id: string | null; visitor_id: string | null; session_id: string | null; created_at: string | null }>) {
  const linkEvents = events.filter((event) => event.tracking_link_id === linkId);
  const redirects = linkEvents.filter((event) => event.event_type === 'redirect').length;
  const pageViews = linkEvents.filter((event) => event.event_type === 'page_view').length;
  const ctas = linkEvents.filter((event) => event.event_type === 'cta_click').length;
  const uniqueVisits = new Set(linkEvents.map((event) => event.visit_id).filter(Boolean)).size;
  const uniqueVisitors = new Set(
    linkEvents
      .map((event) => event.visitor_id || event.session_id)
      .filter(Boolean)
  ).size;
  const lastTouch = [...linkEvents]
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())[0]
    ?.created_at ?? null;

  return { redirects, pageViews, ctas, uniqueVisits, uniqueVisitors, lastTouch };
}

export async function GET(request: Request) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return NextResponse.json({ error: 'Sign in to load tracking links.' }, { status: 401 });

    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId')?.trim();
    if (!workspaceId) return NextResponse.json({ error: 'Workspace is required.' }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 });

    const {
      data: membership,
      error: membershipError
    } = await supabase.from('workspace_members').select('id').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
    if (!membership) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });

    const [{ data: links, error: linksError }, { data: events, error: eventsError }] = await Promise.all([
      supabase
        .from('tracking_links')
        .select('id,workspace_id,journey_id,title,slug,destination_url,is_active,metadata,created_at,updated_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false }),
      supabase
        .from('tracking_events')
        .select('id,tracking_link_id,journey_id,event_type,visit_id,visitor_id,session_id,page_url,referrer_url,metadata,created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(800)
    ]);

    if (linksError) return NextResponse.json({ error: linksError.message }, { status: 500 });
    if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });

    const origin = url.origin;
    const summaries = (links ?? []).map((link) => {
      const summary = summarizeTrackingEvents(
        link.id,
        (events ?? []).map((event) => ({
          id: event.id,
          tracking_link_id: event.tracking_link_id,
          event_type: event.event_type,
          visit_id: event.visit_id,
          visitor_id: event.visitor_id,
          session_id: event.session_id,
          created_at: event.created_at
        }))
      );

      return {
        linkId: link.id,
        title: link.title,
        redirects: summary.redirects,
        pageViews: summary.pageViews,
        ctas: summary.ctas,
        uniqueVisits: summary.uniqueVisits,
        uniqueVisitors: summary.uniqueVisitors,
        lastTouch: summary.lastTouch
      } satisfies TrackingLinkSummary;
    });

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
      linksSummary: summaries,
      events: (events ?? []).map((event) => ({
        id: event.id,
        trackingLinkId: event.tracking_link_id,
        journeyId: event.journey_id,
        eventType: event.event_type,
        visitId: event.visit_id,
        visitorId: event.visitor_id,
        sessionId: event.session_id,
        pageUrl: event.page_url,
        referrerUrl: event.referrer_url,
        metadata: event.metadata ?? {},
        createdAt: event.created_at
      }))
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load tracking links.' }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return NextResponse.json({ error: 'Sign in before creating a tracking link.' }, { status: 401 });

    const body = (await request.json()) as TrackingLinkRequest;
    const workspaceId = body.workspaceId?.trim();
    const title = body.title?.trim();
    const destinationUrl = body.destinationUrl?.trim();

    if (!workspaceId) return NextResponse.json({ error: 'Workspace is required.' }, { status: 400 });
    if (!title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
    if (!destinationUrl) return NextResponse.json({ error: 'Destination URL is required.' }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 });

    const {
      data: membership,
      error: membershipError
    } = await supabase.from('workspace_members').select('id').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
    if (!membership) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });

    const normalizedDestinationUrl = normalizeDestinationUrl(destinationUrl);
    const slug = buildTrackingSlug(title);
    const journeyId = body.journeyId?.trim() || null;

    if (journeyId) {
      const { data: journey, error: journeyError } = await supabase.from('journeys').select('id').eq('id', journeyId).eq('workspace_id', workspaceId).maybeSingle();
      if (journeyError) return NextResponse.json({ error: journeyError.message }, { status: 500 });
      if (!journey) return NextResponse.json({ error: 'Journey was not found in this workspace.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('tracking_links')
      .insert({
        workspace_id: workspaceId,
        journey_id: journeyId,
        title,
        slug,
        destination_url: normalizedDestinationUrl,
        created_by: user.id
      })
      .select('id,workspace_id,journey_id,title,slug,destination_url,is_active,metadata,created_at,updated_at')
      .single();

    if (error || !data) {
      const message = error?.code === '23505' ? 'That tracking slug already exists. Try again.' : error?.message ?? 'Could not create the tracking link.';
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
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create the tracking link.' }, { status: 400 });
  }
}
