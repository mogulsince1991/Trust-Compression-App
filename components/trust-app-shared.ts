import { formatJourneyAssetTypeLabel, type JourneyAssetType } from "@/lib/journey-embeds";

export type DbVideo = {
  id: string;
  title: string;
  source_platform: string;
  source_url: string | null;
  embed_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  summary: string | null;
  suggested_use: string | null;
  proof_type: string | null;
  buying_stage: string | null;
  sales_category: string | null;
  funnel_stage: string | null;
  published_at: string | null;
  created_at: string | null;
  metadata: Record<string, any> | null;
  tags: string[];
};

export type JourneyAsset = {
  id: string;
  videoId: string | null;
  libraryAssetId?: string | null;
  assetType: JourneyAssetType;
  sourcePlatform: string;
  title: string;
  sourceUrl: string | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  summary: string | null;
  note: string | null;
  position: number;
  metadata: Record<string, any> | null;
};

export type LibraryAssetRow = {
  id: string;
  workspaceId: string;
  assetType: JourneyAssetType;
  sourcePlatform: string;
  title: string;
  sourceUrl: string | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
  summary: string | null;
  metadata: Record<string, any> | null;
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
};

export type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  role: string;
  settings: Record<string, any>;
  createdAt: string | null;
  updatedAt: string | null;
};

export type WorkspaceInviteRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  inviteUrl: string;
  expiresAt: string | null;
  createdAt: string | null;
};

export type WorkspaceMemberRow = {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SourceRow = {
  id: string;
  platform: string;
  account_label: string | null;
  status: string | null;
  last_synced_at: string | null;
  error: string | null;
  metadata: Record<string, any> | null;
};

export type JourneySummary = {
  id: string;
  title: string;
  heading: string | null;
  description: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  folderId: string | null;
  shareUrl: string;
  isPublic: boolean;
  publishedAt: string | null;
  createdAt: string | null;
  assets: JourneyAsset[];
  videoIds: string[];
};

export type FolderRow = { id: string; name: string; parent_id: string | null };

export type ContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  company: string | null;
  phone: string | null;
  crmSource?: string | null;
  externalId?: string | null;
  sourceLabel?: string | null;
  detailLabel?: string | null;
  contactRecordId?: string | null;
  status?: string | null;
  soldDate?: string | null;
};

export type JourneyViewRow = {
  id: string;
  journey_id: string;
  video_id: string | null;
  asset_id: string | null;
  event_type: string;
  viewer_label: string | null;
  metadata: Record<string, any> | null;
  created_at: string | null;
};

export type MetricsState = {
  views: JourneyViewRow[];
};

export type TrackingLinkRow = {
  id: string;
  workspaceId: string;
  journeyId: string | null;
  title: string;
  slug: string;
  destinationUrl: string;
  trackingUrl: string;
  isActive: boolean;
  metadata: Record<string, any> | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TrackingEventRow = {
  id: string;
  trackingLinkId: string;
  journeyId: string | null;
  contactId: string | null;
  eventType: "redirect" | "page_view" | "cta_click" | "form_submit" | "opt_in" | "booking" | "purchase" | "custom";
  eventLabel: string | null;
  eventValue: number | null;
  eventCurrency: string | null;
  visitId: string | null;
  visitorId: string | null;
  sessionId: string | null;
  pageUrl: string | null;
  referrerUrl: string | null;
  occurredAt: string | null;
  metadata: Record<string, any> | null;
  createdAt: string | null;
};

export type TrackingIdentityRow = {
  id: string;
  visitorId: string;
  contactId: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  company: string | null;
  externalId: string | null;
  crmSource: string | null;
  firstTrackingLinkId: string | null;
  lastTrackingLinkId: string | null;
  firstJourneyId: string | null;
  lastJourneyId: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  firstTouch: Record<string, any> | null;
  lastTouch: Record<string, any> | null;
  metadata: Record<string, any> | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TrackingState = {
  links: TrackingLinkRow[];
  events: TrackingEventRow[];
  identities: TrackingIdentityRow[];
};

export type SocialProfileRow = {
  id: string;
  workspaceId: string;
  userId: string | null;
  businessProfileId: string | null;
  businessProfileLabel: string | null;
  platform: string;
  username: string | null;
  profileUrl: string | null;
  profileKey: string;
  displayName: string | null;
  avatarUrl: string | null;
  latestCachedMetrics: Record<string, any> | null;
  lastAnalyzedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SocialProfileDraft = {
  platform: string;
  profileUrl: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  businessProfileLabel: string;
};

export type TrackingLinkSummary = {
  link: TrackingLinkRow;
  redirects: number;
  pageViews: number;
  ctas: number;
  formSubmits: number;
  optIns: number;
  bookings: number;
  purchases: number;
  conversionCount: number;
  revenue: number;
  currency: string;
  uniqueVisits: number;
  uniqueVisitors: number;
  identifiedVisitors: number;
  knownContacts: number;
  lastTouch: string | null;
  topPages: string[];
  topReferrers: string[];
  topContacts: string[];
  topEvents: string[];
};

export type JourneyDraft = {
  title: string;
  heading: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  folderName: string;
};

export type JourneyEmbedDraft = {
  title: string;
  url: string;
};

export type TrackingDraft = {
  title: string;
  destinationUrl: string;
  journeyId: string;
};

export type SmartGroup = { key: string; title: string; videos: DbVideo[] };

export type VideoContext = {
  notes: string;
  targetBuyer: string;
  objections: string;
  offer: string;
  suggestedUse: string;
  salesCategory: string;
  funnelStage: string;
  proofType: string;
  buyingStage: string;
  tags: string;
};

export type LibraryFilters = {
  platform: string;
  category: string;
  funnelStage: string;
  proofType: string;
  offer: string;
  buyer: string;
  date: string;
};

export const TRACKING_CONVERSION_TYPES = ["form_submit", "opt_in", "booking", "purchase"] as const;

export const TRACKING_INSTALL_EXAMPLES = [
  'window.TrustCompression.trackOptIn({ label: "Lead form", value: 1 });',
  'window.TrustCompression.trackBooking({ label: "Consultation booked" });',
  'window.TrustCompression.trackPurchase(2400, { label: "Closed deal", currency: "USD" });'
] as const;

export function filterVideos(videos: DbVideo[], query: string, filters: LibraryFilters) {
  return videos.filter((video) => {
    const context = video.metadata?.customContext ?? {};
    const haystack = [
      video.title,
      video.source_platform,
      video.summary,
      video.suggested_use,
      video.proof_type,
      video.buying_stage,
      video.sales_category,
      video.funnel_stage,
      context.notes,
      context.targetBuyer,
      context.objections,
      context.offer,
      ...video.tags
    ]
      .join(" ")
      .toLowerCase();

    if (query && !haystack.includes(query.toLowerCase())) return false;
    if (filters.platform !== "all" && video.source_platform !== filters.platform) return false;
    if (filters.category !== "all" && (video.sales_category ?? video.proof_type) !== filters.category) return false;
    if (filters.funnelStage !== "all" && (video.funnel_stage ?? video.buying_stage) !== filters.funnelStage) return false;
    if (filters.proofType !== "all" && video.proof_type !== filters.proofType) return false;
    if (filters.offer !== "all" && context.offer !== filters.offer) return false;
    if (filters.buyer !== "all" && context.targetBuyer !== filters.buyer) return false;

    if (filters.date !== "all") {
      const dateValue = video.published_at ?? video.created_at;
      if (!dateValue) return false;
      const age = Date.now() - new Date(dateValue).getTime();
      const days = age / 86400000;
      if (filters.date === "last_7" && days > 7) return false;
      if (filters.date === "last_30" && days > 30) return false;
      if (filters.date === "older" && days <= 30) return false;
    }

    return true;
  });
}

export function buildOptions(videos: DbVideo[], folders: FolderRow[]) {
  const contextValues = (key: string) => unique(videos.map((video) => video.metadata?.customContext?.[key]).filter(Boolean));

  return {
    platforms: unique(videos.map((video) => video.source_platform)),
    categories: unique(videos.map((video) => video.sales_category ?? video.proof_type).filter(Boolean)),
    funnelStages: unique(videos.map((video) => video.funnel_stage ?? video.buying_stage).filter(Boolean)),
    proofTypes: unique(videos.map((video) => video.proof_type).filter(Boolean)),
    buyers: contextValues("targetBuyer"),
    objections: contextValues("objections"),
    offers: contextValues("offer"),
    uses: unique(videos.map((video) => video.suggested_use).filter(Boolean)),
    tags: unique(videos.flatMap((video) => video.tags ?? [])),
    folderNames: unique(folders.map((folder) => folder.name))
  };
}

export function buildSmartGroups(videos: DbVideo[]): SmartGroup[] {
  const buckets = videos.reduce<Record<string, DbVideo[]>>((groups, video) => {
    const category = video.sales_category ?? video.proof_type ?? "Education";
    groups[category] = [...(groups[category] ?? []), video];
    return groups;
  }, {});

  const titleMap: Record<string, string> = {
    Objection: "Handle the hard questions",
    Testimonial: "Build trust with customer proof",
    "Product proof": "Show the work clearly",
    Education: "Teach before the call",
    "Founder story": "Make the company feel human",
    "Case study": "Show the transformation",
    FAQ: "Answer the obvious questions",
    Comparison: "Help buyers compare options",
    "Risk reversal": "Lower the perceived risk"
  };

  return Object.entries(buckets)
    .map(([key, groupVideos]) => ({ key, title: titleMap[key] ?? key, videos: groupVideos }))
    .sort((a, b) => b.videos.length - a.videos.length)
    .slice(0, 6);
}

export function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function rate(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export function buildTrackingLinkSummaries(links: TrackingLinkRow[], events: TrackingEventRow[], identities: TrackingIdentityRow[]): TrackingLinkSummary[] {
  return links
    .map((link) => {
      const linkEvents = events.filter((event) => event.trackingLinkId === link.id);
      const visitorIds = Array.from(new Set(linkEvents.map((event) => event.visitorId).filter(Boolean))) as string[];
      const linkedIdentities = identities.filter((identity) => visitorIds.includes(identity.visitorId));
      const redirects = linkEvents.filter((event) => event.eventType === "redirect").length;
      const pageViews = linkEvents.filter((event) => event.eventType === "page_view").length;
      const ctas = linkEvents.filter((event) => event.eventType === "cta_click").length;
      const formSubmits = linkEvents.filter((event) => event.eventType === "form_submit").length;
      const optIns = linkEvents.filter((event) => event.eventType === "opt_in").length;
      const bookings = linkEvents.filter((event) => event.eventType === "booking").length;
      const purchases = linkEvents.filter((event) => event.eventType === "purchase").length;
      const conversionCount = formSubmits + optIns + bookings + purchases;
      const purchaseEvents = linkEvents.filter((event) => event.eventType === "purchase");
      const revenue = purchaseEvents.reduce((sum, event) => sum + (event.eventValue ?? 0), 0);
      const currency = purchaseEvents.find((event) => event.eventCurrency)?.eventCurrency ?? "USD";
      const uniqueVisits = new Set(linkEvents.map((event) => event.visitId).filter(Boolean)).size;
      const uniqueVisitors = new Set(linkEvents.map((event) => event.visitorId || event.sessionId).filter(Boolean)).size;
      const identifiedVisitors = linkedIdentities.filter((identity) => identity.contactId || identity.email || identity.externalId).length;
      const knownContacts = new Set([...linkEvents.map((event) => event.contactId), ...linkedIdentities.map((identity) => identity.contactId)].filter(Boolean)).size;
      const lastTouch = [...linkEvents].sort((a, b) => getTrackingTimestamp(b) - getTrackingTimestamp(a))[0]?.occurredAt ?? link.createdAt;

      return {
        link,
        redirects,
        pageViews,
        ctas,
        formSubmits,
        optIns,
        bookings,
        purchases,
        conversionCount,
        revenue,
        currency,
        uniqueVisits,
        uniqueVisitors,
        identifiedVisitors,
        knownContacts,
        lastTouch,
        topPages: summarizeTopValues(linkEvents.map((event) => compactTrackingPage(event.pageUrl))),
        topReferrers: summarizeTopValues(linkEvents.map((event) => compactTrackingReferrer(event.referrerUrl))),
        topContacts: summarizeTopValues(linkedIdentities.map((identity) => identity.name || identity.email || identity.company)),
        topEvents: summarizeTopValues(
          linkEvents
            .filter((event) => event.eventType !== "redirect")
            .filter((event) => !(event.eventType === "custom" && (event.eventLabel ?? "").toLowerCase() === "identify"))
            .map((event) => event.eventLabel ?? formatEventTypeLabel(event.eventType))
        )
      };
    })
    .sort((a, b) => new Date(b.lastTouch ?? 0).getTime() - new Date(a.lastTouch ?? 0).getTime());
}

export function formatDuration(seconds: number | null) {
  if (!seconds) return "--";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatPlatformLabel(value: string) {
  return value.replace(/_/g, " ");
}

export function formatJourneyAssetLabel(asset: JourneyAsset) {
  if (asset.assetType === "video") return formatPlatformLabel(asset.sourcePlatform);
  return formatJourneyAssetTypeLabel(asset.assetType);
}

export function isVideoJourneyAsset(asset: JourneyAsset) {
  return asset.assetType === "video" && !!asset.videoId;
}

export function buildJourneyAssetFromVideo(video: DbVideo, position = 1): JourneyAsset {
  return {
    id: video.id,
    videoId: video.id,
    libraryAssetId: null,
    assetType: "video",
    sourcePlatform: video.source_platform,
    title: video.title,
    sourceUrl: video.source_url,
    embedUrl: video.embed_url,
    thumbnailUrl: video.thumbnail_url,
    durationSeconds: video.duration_seconds,
    summary: video.summary,
    note: null,
    position,
    metadata: video.metadata
  };
}

export function formatSourceStatus(value: string | null) {
  const next = value?.trim();
  return next ? next.replace(/_/g, " ") : "unknown";
}

export function formatPublishedLabel(video: DbVideo) {
  const value = video.published_at ?? video.created_at;
  if (!value) return "Unscheduled";
  return formatShortDate(value) ?? "Unscheduled";
}

export function formatCurrencyValue(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value || 0);
}

export function formatDateTime(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString();
}

export function formatShortDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString();
}

export function getOriginFromUrl(value: string) {
  try {
    return new URL(value).origin;
  } catch (_error) {
    return "";
  }
}

export function getTrackingScriptTag(link: TrackingLinkRow) {
  const origin = getOriginFromUrl(link.trackingUrl) || "https://your-app-domain.com";
  return `<script async src="${origin}/tc.js" data-link-slug="${link.slug}"></script>`;
}

function getTrackingTimestamp(event: TrackingEventRow) {
  return new Date(event.occurredAt ?? event.createdAt ?? 0).getTime();
}

function summarizeTopValues(values: Array<string | null | undefined>, limit = 3) {
  const counts = values.filter(Boolean).reduce<Map<string, number>>((map, value) => {
    const key = String(value);
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map());

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

function compactTrackingPage(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`;
  } catch (_error) {
    return value;
  }
}

function compactTrackingReferrer(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch (_error) {
    return value;
  }
}

function formatEventTypeLabel(value: TrackingEventRow["eventType"]) {
  return value.replace(/_/g, " ");
}
