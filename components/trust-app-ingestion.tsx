"use client";

import {
  Archive,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Copy,
  Folder,
  Import,
  Link2,
  Loader2,
  LogOut,
  MousePointerClick,
  Plus,
  RefreshCw,
  Route,
  Save,
  Search,
  Send,
  Share2,
  Trash2,
  Wand2
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type RoleId = "libraryManager" | "salesRep" | "owner" | "prospect";
type ViewId = "sources" | "library" | "tracking" | "journeys" | "metrics";

type DbVideo = {
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

type SourceRow = {
  id: string;
  platform: string;
  account_label: string | null;
  status: string | null;
  last_synced_at: string | null;
  error: string | null;
  metadata: Record<string, any> | null;
};

type JourneySummary = {
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
  videoIds: string[];
};

type FolderRow = { id: string; name: string; parent_id: string | null };
type ContactRow = { id: string; name: string | null; email: string | null; company: string | null; phone: string | null };

type JourneyViewRow = {
  id: string;
  journey_id: string;
  video_id: string | null;
  event_type: string;
  viewer_label: string | null;
  metadata: Record<string, any> | null;
  created_at: string | null;
};

type MetricsState = {
  views: JourneyViewRow[];
};

type TrackingLinkRow = {
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

type TrackingEventRow = {
  id: string;
  trackingLinkId: string;
  journeyId: string | null;
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

type TrackingState = {
  links: TrackingLinkRow[];
  events: TrackingEventRow[];
};

type TrackingLinkSummary = {
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
  lastTouch: string | null;
  topPages: string[];
  topReferrers: string[];
  topEvents: string[];
};

type JourneyDraft = {
  title: string;
  heading: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  folderName: string;
};

type TrackingDraft = {
  title: string;
  destinationUrl: string;
  journeyId: string;
};

type SmartGroup = { key: string; title: string; videos: DbVideo[] };

const TRACKING_CONVERSION_TYPES = ["form_submit", "opt_in", "booking", "purchase"] as const;
const TRACKING_INSTALL_EXAMPLES = [
  'window.TrustCompression.trackOptIn({ label: "Lead form", value: 1 });',
  'window.TrustCompression.trackBooking({ label: "Consultation booked" });',
  'window.TrustCompression.trackPurchase(2400, { label: "Closed deal", currency: "USD" });'
] as const;

type VideoContext = {
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

type LibraryFilters = {
  platform: string;
  category: string;
  funnelStage: string;
  proofType: string;
  offer: string;
  buyer: string;
  date: string;
};

const emptyDraft: JourneyDraft = {
  title: "",
  heading: "",
  description: "",
  ctaLabel: "Continue the conversation",
  ctaUrl: "",
  folderName: ""
};

const emptyFilters: LibraryFilters = {
  platform: "all",
  category: "all",
  funnelStage: "all",
  proofType: "all",
  offer: "all",
  buyer: "all",
  date: "all"
};

const emptyTrackingDraft: TrackingDraft = {
  title: "",
  destinationUrl: "",
  journeyId: ""
};

const roles: Record<RoleId, { label: string; title: string; description: string; view: ViewId; placeholder: string }> = {
  libraryManager: {
    label: "Library Manager",
    title: "Connect the content sources.",
    description: "Import public channels, playlists, videos, and folders into a searchable proof library.",
    view: "library",
    placeholder: "Search imported videos, context, tags..."
  },
  salesRep: {
    label: "Sales Rep",
    title: "Find proof for this buyer.",
    description: "Search the saved library and assemble the right proof sequence for a prospect.",
    view: "library",
    placeholder: "Search by objection, buyer, offer, concern..."
  },
  owner: {
    label: "Owner",
    title: "See proof and performance.",
    description: "Review library usage, buyer watch activity, and public source performance.",
    view: "metrics",
    placeholder: "Search proof, gaps, objections..."
  },
  prospect: {
    label: "Prospect",
    title: "View a quiet trust journey.",
    description: "A clean buyer-facing sequence built from the imported library.",
    view: "journeys",
    placeholder: "Search within this journey..."
  }
};

const noMagicLinkEmails = new Set(["admin@unmarked.media"]);

export function TrustAppIngestion() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [roleId, setRoleId] = useState<RoleId | null>("libraryManager");
  const [view, setView] = useState<ViewId>("library");
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [videos, setVideos] = useState<DbVideo[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [tracking, setTracking] = useState<TrackingState>({ links: [], events: [] });
  const [selected, setSelected] = useState<DbVideo | null>(null);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsState>({ views: [] });
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<LibraryFilters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [workspaceBooted, setWorkspaceBooted] = useState(false);
  const [working, setWorking] = useState(false);
  const [draftVideos, setDraftVideos] = useState<DbVideo[]>([]);
  const [draft, setDraft] = useState<JourneyDraft>(emptyDraft);
  const [trackingDraft, setTrackingDraft] = useState<TrackingDraft>(emptyTrackingDraft);
  const [journeyWorking, setJourneyWorking] = useState(false);
  const [trackingWorking, setTrackingWorking] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const role = roleId ? roles[roleId] : null;
  const isInternal = roleId !== "prospect";
  const options = useMemo(() => buildOptions(videos, folders), [videos, folders]);
  const visibleVideos = useMemo(() => filterVideos(videos, query, filters), [videos, query, filters]);
  const smartGroups = useMemo(() => buildSmartGroups(visibleVideos), [visibleVideos]);
  const showCommandSearch = view === "library";

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setWorkspaceId(null);
        setVideos([]);
        setSources([]);
        setJourneys([]);
        setFolders([]);
        setContacts([]);
        setSelected(null);
        setMetrics({ views: [] });
      }
    });

    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session || !isInternal) return;
    let active = true;

    async function openWorkspace() {
      if (!workspaceBooted) setLoading(true);
      setError("");
      const { data: id, error: workspaceError } = await supabase.rpc("ensure_workspace", { workspace_name: "Trust Library" });
      if (!active) return;
      if (workspaceError || !id) {
        setError(workspaceError?.message ?? "Could not open workspace.");
        setLoading(false);
        return;
      }

      setWorkspaceId(id);
      await refreshWorkspace(id);
      if (active) {
        setWorkspaceBooted(true);
        setLoading(false);
      }
    }

    void openWorkspace();
    return () => {
      active = false;
    };
  }, [isInternal, session, supabase]);

  async function loadVideos(nextWorkspaceId = workspaceId) {
    if (!supabase || !nextWorkspaceId) return;
    const { data, error: loadError } = await supabase
      .from("videos")
      .select("id,title,source_platform,source_url,embed_url,thumbnail_url,duration_seconds,summary,suggested_use,proof_type,buying_stage,sales_category,funnel_stage,published_at,created_at,metadata,tags")
      .eq("workspace_id", nextWorkspaceId)
      .is("deleted_at", null)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (loadError) {
      setError(loadError.message);
      return;
    }

    const nextVideos = (data ?? []) as DbVideo[];
    setVideos(nextVideos);
    setSelected((current) => (current ? nextVideos.find((video) => video.id === current.id) ?? nextVideos[0] ?? null : nextVideos[0] ?? null));
  }

  async function loadSources(nextWorkspaceId = workspaceId) {
    if (!supabase || !nextWorkspaceId) return;
    const { data } = await supabase.from("sources").select("id,platform,account_label,status,last_synced_at,error,metadata").eq("workspace_id", nextWorkspaceId).order("created_at", { ascending: false });
    setSources((data ?? []) as SourceRow[]);
  }

  async function loadJourneys(nextWorkspaceId = workspaceId) {
    if (!session || !nextWorkspaceId) return;
    const response = await fetch(`/api/journeys?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (!response.ok) return;
    const result = (await response.json()) as { journeys?: JourneySummary[]; folders?: FolderRow[] };
    const nextJourneys = result.journeys ?? [];
    setJourneys(nextJourneys);
    setFolders(result.folders ?? []);
    return nextJourneys;
  }

  async function loadContacts(nextWorkspaceId = workspaceId) {
    if (!supabase || !nextWorkspaceId) return;
    const { data } = await supabase.from("contacts").select("id,name,email,company,phone").eq("workspace_id", nextWorkspaceId).order("updated_at", { ascending: false }).limit(100);
    setContacts((data ?? []) as ContactRow[]);
  }

  async function loadTracking(nextWorkspaceId = workspaceId) {
    if (!session || !nextWorkspaceId) return;
    const response = await fetch(`/api/tracking-links?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (!response.ok) return;
    const result = (await response.json()) as { links?: TrackingLinkRow[]; events?: TrackingEventRow[] };
    setTracking({ links: result.links ?? [], events: result.events ?? [] });
  }

  async function loadMetrics(nextWorkspaceId = workspaceId, nextJourneys = journeys) {
    if (!supabase || !nextWorkspaceId) return;
    const journeyIds = nextJourneys.map((journey) => journey.id);
    if (!journeyIds.length) {
      setMetrics({ views: [] });
      return;
    }
    const { data } = await supabase.from("journey_views").select("id,journey_id,video_id,event_type,viewer_label,metadata,created_at").in("journey_id", journeyIds).order("created_at", { ascending: false });
    setMetrics({ views: (data ?? []) as JourneyViewRow[] });
  }

  async function refreshWorkspace(nextWorkspaceId = workspaceId) {
    await Promise.all([loadVideos(nextWorkspaceId), loadSources(nextWorkspaceId), loadContacts(nextWorkspaceId)]);
    const [nextJourneys] = await Promise.all([loadJourneys(nextWorkspaceId), loadTracking(nextWorkspaceId)]);
    await loadMetrics(nextWorkspaceId, nextJourneys ?? []);
  }

  async function importSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !session) return;
    const form = event.currentTarget;
    const sourceUrl = String(new FormData(form).get("sourceUrl") ?? "").trim();
    if (!sourceUrl) return;
    await runImportRequest("/api/sources/import", { workspaceId, sourceUrl }, () => form.reset());
  }

  async function reimportSource(source: SourceRow) {
    if (!workspaceId) return;
    await runImportRequest(`/api/sources/${source.id}/reimport`, { workspaceId });
  }

  async function runImportRequest(url: string, body: Record<string, unknown>, onSuccess?: () => void) {
    if (!session) return;
    setWorking(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
      const result = (await response.json()) as { imported?: number; updated?: number; skippedDuplicates?: number; duplicateCandidates?: number; importMode?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not import that source.");
      onSuccess?.();
      setNotice(`Imported ${result.imported ?? 0}, updated ${result.updated ?? 0}, skipped ${result.skippedDuplicates ?? 0}, flagged ${result.duplicateCandidates ?? 0}.`);
      await refreshWorkspace();
      setView("library");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not import that source.");
    } finally {
      setWorking(false);
    }
  }

  async function saveVideoContext(video: DbVideo, context: VideoContext) {
    if (!session || !workspaceId) return;
    setWorking(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          workspaceId,
          suggestedUse: context.suggestedUse,
          salesCategory: context.salesCategory,
          funnelStage: context.funnelStage,
          proofType: context.proofType || context.salesCategory,
          buyingStage: context.buyingStage || context.funnelStage,
          tags: context.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          customContext: {
            notes: context.notes,
            targetBuyer: context.targetBuyer,
            objections: context.objections,
            offer: context.offer
          }
        })
      });
      const result = (await response.json()) as { video?: DbVideo; error?: string };
      if (!response.ok || !result.video) throw new Error(result.error ?? "Could not save context.");
      setVideos((current) => current.map((item) => (item.id === video.id ? result.video! : item)));
      setSelected(result.video);
      setNotice("Video context saved and searchable.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not save context.");
    } finally {
      setWorking(false);
    }
  }

  async function archiveVideo(video: DbVideo) {
    if (!session || !workspaceId) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/videos/${video.id}?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not archive video.");
      setVideos((current) => current.filter((item) => item.id !== video.id));
      setDraftVideos((current) => current.filter((item) => item.id !== video.id));
      setSelected((current) => (current?.id === video.id ? videos.find((item) => item.id !== video.id) ?? null : current));
      setNotice("Video archived. Existing journey metrics remain intact.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not archive video.");
    } finally {
      setWorking(false);
    }
  }

  function addToJourney(video: DbVideo) {
    setDraftVideos((current) => (current.some((item) => item.id === video.id) ? current : [...current, video]));
    if (!draft.title) {
      setDraft((currentDraft) => ({ ...currentDraft, title: "Proof journey", heading: "A focused path through the videos that matter most.", description: "Watch these in order for a clearer view of the proof, questions, and next step." }));
    }
    setNotice(`Added "${video.title}" to the journey draft.`);
  }

  function removeFromJourney(videoId: string) {
    setDraftVideos((current) => current.filter((video) => video.id !== videoId));
  }

  function moveDraftVideo(videoId: string, direction: -1 | 1) {
    setDraftVideos((current) => {
      const index = current.findIndex((video) => video.id === videoId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  function editJourney(journey: JourneySummary) {
    setSelectedJourneyId(journey.id);
    setDraft({
      title: journey.title ?? "",
      heading: journey.heading ?? "",
      description: journey.description ?? "",
      ctaLabel: journey.ctaLabel ?? "Continue the conversation",
      ctaUrl: journey.ctaUrl ?? "",
      folderName: folders.find((folder) => folder.id === journey.folderId)?.name ?? ""
    });
    setDraftVideos(journey.videoIds.map((id) => videos.find((video) => video.id === id)).filter(Boolean) as DbVideo[]);
    setShareUrl(journey.shareUrl ?? "");
    setView("journeys");
    setNotice("Editing saved journey.");
  }

  function newJourney() {
    setSelectedJourneyId(null);
    setDraft(emptyDraft);
    setDraftVideos([]);
    setShareUrl("");
    setView("journeys");
  }

  async function generateJourney() {
    if (!draftVideos.length) return;
    setJourneyWorking(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/journeys/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videos: draftVideos, prompt: "Create a premium, minimal buyer-facing proof journey." }) });
      const result = (await response.json()) as Partial<JourneyDraft> & { ctaLabel?: string; orderedTitles?: string[]; source?: string };
      if (!response.ok) throw new Error("Could not generate journey copy.");
      setDraft((current) => ({ ...current, title: result.title || current.title, heading: result.heading || current.heading, description: result.description || current.description, ctaLabel: result.ctaLabel || current.ctaLabel }));
      if (Array.isArray(result.orderedTitles)) {
        setDraftVideos((current) => [...current].sort((a, b) => ((result.orderedTitles?.indexOf(a.title) ?? 999) < 0 ? 999 : result.orderedTitles?.indexOf(a.title) ?? 999) - ((result.orderedTitles?.indexOf(b.title) ?? 999) < 0 ? 999 : result.orderedTitles?.indexOf(b.title) ?? 999)));
      }
      setNotice(result.source === "rules" ? "Organized with the no-AI fallback." : "AI generated the journey copy and order.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not generate journey copy.");
    } finally {
      setJourneyWorking(false);
    }
  }

  async function publishJourney() {
    if (!workspaceId || !session || !draftVideos.length) return;
    setJourneyWorking(true);
    setNotice("");
    setError("");
    try {
      const body = { workspaceId, ...draft, videoIds: draftVideos.map((video) => video.id), publish: true };
      const response = await fetch(selectedJourneyId ? `/api/journeys/${selectedJourneyId}` : "/api/journeys", { method: selectedJourneyId ? "PATCH" : "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
      const result = (await response.json()) as { id?: string; shareUrl?: string; error?: string };
      if (!response.ok || !result.shareUrl) throw new Error(result.error ?? "Could not publish the journey.");
      const absoluteUrl = new URL(result.shareUrl, window.location.origin).toString();
      setShareUrl(absoluteUrl);
      setSelectedJourneyId(result.id ?? selectedJourneyId);
      setNotice(selectedJourneyId ? "Journey updated. The share link is ready." : "Journey published. The share link is ready.");
      await refreshWorkspace();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not publish the journey.");
    } finally {
      setJourneyWorking(false);
    }
  }

  async function createContactShare(contact: { contactId?: string; name?: string; email?: string; company?: string }) {
    if (!workspaceId || !session || !selectedJourneyId) return;
    setJourneyWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/journeys/${selectedJourneyId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ workspaceId, contactId: contact.contactId, contact: contact.contactId ? undefined : { name: contact.name, email: contact.email, company: contact.company } })
      });
      const result = (await response.json()) as { shareUrl?: string; error?: string };
      if (!response.ok || !result.shareUrl) throw new Error(result.error ?? "Could not create contact link.");
      setShareUrl(new URL(result.shareUrl, window.location.origin).toString());
      setNotice("Contact-specific journey link created.");
      await loadContacts();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create contact link.");
    } finally {
      setJourneyWorking(false);
    }
  }

  async function createTrackingLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !session) return;

    setTrackingWorking(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/tracking-links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workspaceId,
          title: trackingDraft.title,
          destinationUrl: trackingDraft.destinationUrl,
          journeyId: trackingDraft.journeyId || null
        })
      });
      const result = (await response.json()) as { link?: TrackingLinkRow; error?: string };
      if (!response.ok || !result.link) throw new Error(result.error ?? "Could not create the tracking link.");

      setTrackingDraft(emptyTrackingDraft);
      setNotice(`Tracking link ready: ${result.link.trackingUrl}`);
      await loadTracking(workspaceId);
      setView("tracking");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create the tracking link.");
    } finally {
      setTrackingWorking(false);
    }
  }

  function chooseRole(nextRole: RoleId) {
    setRoleId(nextRole);
    setView(roles[nextRole].view);
    setNotice("");
    setError("");
  }

  function goHome() {
    setView("library");
    setNotice("");
    setError("");
  }

  if (!roleId || !role) return <RoleGate onChoose={chooseRole} />;
  if (loading && !workspaceBooted) return <main className="role-gate"><Loader2 className="spin" /><h1>Opening workspace.</h1></main>;
  if (!supabase && isInternal) return <SimpleGate title="Supabase is not configured." body="Add the Supabase public URL and publishable key in Vercel." onBack={() => setRoleId(null)} />;
  if (!session && isInternal) return <AuthGate role={role} supabase={supabase} onBack={() => setRoleId(null)} />;

  return (
    <div className="app">
      <aside className="side" aria-label="Workspace">
        <button className="mark" onClick={goHome} aria-label="Go to library home">T</button>
        <nav className="side-nav">
          <button className={view === "library" ? "icon-button is-active" : "icon-button"} onClick={() => setView("library")} aria-label="Library" title="Library"><Clapperboard /><span>Library</span></button>
          <button className={view === "sources" ? "icon-button is-active" : "icon-button"} onClick={() => setView("sources")} aria-label="Sources" title="Sources"><Import /><span>Sources</span></button>
          <button className={view === "tracking" ? "icon-button is-active" : "icon-button"} onClick={() => setView("tracking")} aria-label="Link tracking" title="Link tracking"><Link2 /><span>Links</span></button>
          <button className={view === "metrics" ? "icon-button is-active" : "icon-button"} onClick={() => setView("metrics")} aria-label="Sales metrics" title="Metrics"><BarChart3 /><span>Metrics</span></button>
          <button className={view === "journeys" ? "icon-button is-active" : "icon-button"} onClick={newJourney} aria-label="Journeys" title="Journeys"><Route /><span>Journeys</span></button>
        </nav>
        {session && <button className="icon-button" onClick={() => supabase?.auth.signOut()} aria-label="Sign out" title="Sign out"><LogOut /><span>Exit</span></button>}
      </aside>

      <main className="stage">
        <header className="command-bar">
          <div className="brand-line"><span>{role.label}</span><strong>Trust Library</strong></div>
          {showCommandSearch ? <label className="command-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={role.placeholder} /></label> : <div className="command-spacer" aria-hidden="true" />}
        </header>

        {view === "library" && <LibraryFiltersBar filters={filters} options={options} onChange={setFilters} />}

        <section className="role-context is-quiet"><span>{role.label}</span><h2>{role.title}</h2><p>{role.description}</p></section>
        {(notice || error) && <p style={{ margin: "0 6px 18px", color: error ? "#ffd4d4" : "#d8d1c5" }}>{error || notice}</p>}

        {view === "sources" && <SourcesView sources={sources} importing={working} onImport={importSource} onReimport={reimportSource} />}
        {view === "library" && <LibraryConfigurator videos={visibleVideos} selected={selected} saving={working} options={options} onSelect={setSelected} onAdd={addToJourney} onArchive={archiveVideo} onSaveContext={saveVideoContext} />}
        {view === "tracking" && <LinkTrackingView draft={trackingDraft} journeys={journeys} tracking={tracking} working={trackingWorking} onDraftChange={setTrackingDraft} onCreate={createTrackingLink} />}
        {view === "metrics" && <MetricsView metrics={metrics} videos={videos} sources={sources} journeys={journeys} contacts={contacts} tracking={tracking} />}
        {view === "journeys" && <JourneysView journeys={journeys} folders={folders} draftVideos={draftVideos} groups={smartGroups} videos={visibleVideos} shareUrl={shareUrl} onEdit={editJourney} onAdd={addToJourney} />}
      </main>

      {isInternal && <JourneyTray draft={draft} videos={draftVideos} working={journeyWorking} shareUrl={shareUrl} contacts={contacts} selectedJourneyId={selectedJourneyId} options={options} onDraftChange={setDraft} onGenerate={generateJourney} onPublish={publishJourney} onMove={moveDraftVideo} onRemove={removeFromJourney} onCreateContactShare={createContactShare} />}
    </div>
  );
}

function RoleGate({ onChoose }: { onChoose: (role: RoleId) => void }) {
  return <main className="role-gate"><section className="gate-intro"><span>Trust Library</span><h1>Choose your workspace.</h1><p>Start with sources, then turn imported videos into proof journeys.</p></section><section className="role-grid">{(Object.keys(roles) as RoleId[]).map((id) => <button className="role-card" key={id} onClick={() => onChoose(id)}><span>{roles[id].label}</span><h2>{roles[id].title}</h2><p>{roles[id].description}</p><i>Open <ArrowUpRight /></i></button>)}</section></main>;
}

function AuthGate({ role, supabase, onBack }: { role: (typeof roles)[RoleId]; supabase: ReturnType<typeof createBrowserSupabaseClient>; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [sending, setSending] = useState(false);

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !email) return;
    if (noMagicLinkEmails.has(email.trim().toLowerCase())) {
      setIsError(true);
      setMessage("Use password login for this admin account. No magic-link email was sent.");
      return;
    }
    setSending(true);
    setIsError(false);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setIsError(Boolean(error));
    setMessage(error ? error.message : "Check your email. The sign-in link has been sent.");
    setSending(false);
  }

  async function signInWithPassword() {
    if (!supabase || !email || !password) return;
    setSending(true);
    setIsError(false);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsError(Boolean(error));
    setMessage(error ? error.message : "Signed in. Opening your workspace...");
    setSending(false);
  }

  return <main className="role-gate"><button className="text-button" onClick={onBack}>Back</button><section className="gate-intro"><span>{role.label}</span><h1>Sign in.</h1><p>{role.description}</p></section><form className="prospect-brief" onSubmit={sendMagicLink}><div className="brief-grid"><label className="wide-field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label><label className="wide-field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password login" minLength={6} /></label></div><button className="wide-action" disabled={sending}>{sending ? <Loader2 className="spin" /> : <ArrowUpRight />}Send magic link</button><button className="text-button" type="button" disabled={sending || !email || password.length < 6} onClick={signInWithPassword} style={{ marginTop: 12 }}>Sign in with password</button>{message && <p style={{ border: "1px solid rgba(255,255,255,.16)", color: isError ? "#ffd4d4" : "#e9e2d6", marginTop: 16, padding: "14px 16px" }}>{message}</p>}</form></main>;
}

function SourcesView({ sources, importing, onImport, onReimport }: { sources: SourceRow[]; importing: boolean; onImport: (event: FormEvent<HTMLFormElement>) => void; onReimport: (source: SourceRow) => void }) {
  return <section className="sources-grid"><section className="browse"><div className="collection-top"><div><span>Sources</span><h1>Import public video sources</h1></div><p>YouTube works now. Public Drive folders work when GOOGLE_DRIVE_API_KEY is set in Vercel.</p></div><form className="prospect-brief" onSubmit={onImport}><div className="brief-grid"><label className="wide-field"><span>Public source URL</span><input name="sourceUrl" required placeholder="YouTube channel, playlist, video, or public Drive folder URL" /></label></div><button className="wide-action" disabled={importing}>{importing ? <Loader2 className="spin" /> : <Import />}Import source</button></form></section><aside className="source-panel"><div className="mini-head"><span>Connected sources</span><strong>{sources.length}</strong></div><div className="source-list">{sources.map((source) => <article className="source-card" key={source.id}><div className="source-card-copy"><div className="source-card-heading"><span>{formatPlatformLabel(source.platform)}</span><strong>{source.account_label ?? formatPlatformLabel(source.platform)}</strong></div><div className="source-card-meta"><small>{formatSourceStatus(source.status)}</small><small>{source.last_synced_at ? `Updated ${formatDateTime(source.last_synced_at)}` : "Waiting for first sync"}</small></div>{source.error && <p>{source.error}</p>}<div className="source-stats"><div><small>Imported</small><strong>{String(source.metadata?.imported ?? 0)}</strong></div><div><small>Updated</small><strong>{String(source.metadata?.updated ?? 0)}</strong></div><div><small>Flagged</small><strong>{String(source.metadata?.duplicateCandidates ?? 0)}</strong></div></div></div><button className="icon-mini" disabled={importing} onClick={() => onReimport(source)} aria-label="Reimport source"><RefreshCw /></button></article>)}</div></aside></section>;
}

function LibraryFiltersBar({ filters, options, onChange }: { filters: LibraryFilters; options: ReturnType<typeof buildOptions>; onChange: (filters: LibraryFilters) => void }) {
  return <section className="filter-bar"><FilterSelect label="Source" value={filters.platform} options={options.platforms} onChange={(platform) => onChange({ ...filters, platform })} /><FilterSelect label="Date" value={filters.date} options={["last_7", "last_30", "older"]} labels={{ last_7: "Last 7 days", last_30: "Last 30 days", older: "Older" }} onChange={(date) => onChange({ ...filters, date })} /><FilterSelect label="Category" value={filters.category} options={options.categories} onChange={(category) => onChange({ ...filters, category })} /><FilterSelect label="Funnel" value={filters.funnelStage} options={options.funnelStages} onChange={(funnelStage) => onChange({ ...filters, funnelStage })} /><FilterSelect label="Proof" value={filters.proofType} options={options.proofTypes} onChange={(proofType) => onChange({ ...filters, proofType })} /><FilterSelect label="Offer" value={filters.offer} options={options.offers} onChange={(offer) => onChange({ ...filters, offer })} /><FilterSelect label="Buyer" value={filters.buyer} options={options.buyers} onChange={(buyer) => onChange({ ...filters, buyer })} /><button className="text-button compact" onClick={() => onChange(emptyFilters)}>Clear</button></section>;
}

function FilterSelect({ label, value, options, labels, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return <label className="filter-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="all">All</option>{options.map((option) => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}</select></label>;
}

function LibraryConfigurator({ videos, selected, saving, options, onSelect, onAdd, onArchive, onSaveContext }: { videos: DbVideo[]; selected: DbVideo | null; saving: boolean; options: ReturnType<typeof buildOptions>; onSelect: (video: DbVideo) => void; onAdd: (video: DbVideo) => void; onArchive: (video: DbVideo) => void; onSaveContext: (video: DbVideo, context: VideoContext) => void }) {
  if (!videos.length) return <section className="prospect-brief"><span>No videos yet</span><h2>Start by importing a public source.</h2><p>Paste a YouTube video or a public Drive folder to build the library.</p></section>;
  return <section className="library-configurator"><div className="config-topline"><span>{videos.length} videos</span><p>Browse the newest proof first, select a video, then shape the searchable context or add it to a journey.</p></div><section className="library-shelf"><section className="library-strip" aria-label="Video library selector">{videos.map((video) => <button className={selected?.id === video.id ? "strip-card is-selected" : "strip-card"} key={video.id} onClick={() => onSelect(video)}><span className="strip-thumb" style={{ backgroundImage: `url(${video.thumbnail_url ?? ""})` }} /><div className="strip-card-body"><strong>{video.title}</strong><small>{video.sales_category ?? video.source_platform}</small><small>{formatPublishedLabel(video)}</small></div></button>)}</section></section><BottomPlayer selected={selected} saving={saving} options={options} onAdd={onAdd} onArchive={onArchive} onSaveContext={onSaveContext} /></section>;
}

function BottomPlayer({ selected, saving, options, onAdd, onArchive, onSaveContext }: { selected: DbVideo | null; saving: boolean; options: ReturnType<typeof buildOptions>; onAdd: (video: DbVideo) => void; onArchive: (video: DbVideo) => void; onSaveContext: (video: DbVideo, context: VideoContext) => void }) {
  if (!selected) return null;
  return <section className="library-player-dock"><div className="bottom-video">{selected.embed_url ? <iframe src={selected.embed_url} title={selected.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /> : <div style={{ backgroundImage: `url(${selected.thumbnail_url ?? ""})` }} />}</div><section className="bottom-context"><div className="mini-head"><span>{formatPlatformLabel(selected.source_platform)}</span><div className="inline-actions"><button className="text-button compact" onClick={() => onAdd(selected)}><Plus />Journey</button><button className="text-button compact danger" onClick={() => onArchive(selected)}><Archive />Archive</button></div></div><div className="bottom-context-heading"><h2>{selected.title}</h2><p>{formatPublishedLabel(selected)} / {formatDuration(selected.duration_seconds)}</p></div><ContextEditor key={selected.id} video={selected} saving={saving} options={options} onSave={onSaveContext} /></section></section>;
}

function ContextEditor({ video, saving, options, onSave }: { video: DbVideo; saving: boolean; options: ReturnType<typeof buildOptions>; onSave: (video: DbVideo, context: VideoContext) => void }) {
  const context = video.metadata?.customContext ?? {};
  const [form, setForm] = useState<VideoContext>({ notes: context.notes ?? "", targetBuyer: context.targetBuyer ?? "", objections: context.objections ?? "", offer: context.offer ?? "", suggestedUse: video.suggested_use ?? "", salesCategory: video.sales_category ?? video.proof_type ?? "Education", funnelStage: video.funnel_stage ?? video.buying_stage ?? "consideration", proofType: video.proof_type ?? video.sales_category ?? "", buyingStage: video.buying_stage ?? video.funnel_stage ?? "", tags: (video.tags ?? []).join(", ") });
  return <form className="context-form" onSubmit={(event) => { event.preventDefault(); onSave(video, form); }}><Datalists options={options} /><label className="wide-field"><span>Search context</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="What this video proves, when to use it, and what a rep should search to find it." /></label><div className="brief-grid compact-grid"><ContextInput label="Buyer" list="buyers" value={form.targetBuyer} onChange={(targetBuyer) => setForm({ ...form, targetBuyer })} /><ContextInput label="Objections" list="objections" value={form.objections} onChange={(objections) => setForm({ ...form, objections })} /><ContextInput label="Offer" list="offers" value={form.offer} onChange={(offer) => setForm({ ...form, offer })} /><ContextInput label="Use case" list="uses" value={form.suggestedUse} onChange={(suggestedUse) => setForm({ ...form, suggestedUse })} /><ContextInput label="Sales category" list="categories" value={form.salesCategory} onChange={(salesCategory) => setForm({ ...form, salesCategory })} /><ContextInput label="Funnel stage" list="funnelStages" value={form.funnelStage} onChange={(funnelStage) => setForm({ ...form, funnelStage })} /></div><label className="wide-field"><span>Tags</span><input list="tags" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="comma, separated, tags" /></label><button className="wide-action" disabled={saving}>{saving ? <Loader2 className="spin" /> : <Save />}Save context</button></form>;
}

function ContextInput({ label, list, value, onChange }: { label: string; list: string; value: string; onChange: (value: string) => void }) {
  return <label><span>{label}</span><input list={list} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Datalists({ options }: { options: ReturnType<typeof buildOptions> }) {
  const lists: Array<[string, string[]]> = [["buyers", options.buyers], ["objections", options.objections], ["offers", options.offers], ["uses", options.uses], ["categories", options.categories], ["funnelStages", options.funnelStages], ["tags", options.tags], ["folders", options.folderNames]];
  return <>{lists.map(([id, values]) => <datalist id={id} key={id}>{values.map((value) => <option key={value} value={value} />)}</datalist>)}</>;
}

function JourneysView({ journeys, folders, draftVideos, groups, videos, shareUrl, onEdit, onAdd }: { journeys: JourneySummary[]; folders: FolderRow[]; draftVideos: DbVideo[]; groups: SmartGroup[]; videos: DbVideo[]; shareUrl?: string; onEdit: (journey: JourneySummary) => void; onAdd: (video: DbVideo) => void }) {
  return <section className="journey-workspace"><aside className="saved-journeys"><div className="mini-head"><span>Saved journeys</span><strong>{journeys.length}</strong></div>{journeys.map((journey) => <article className="saved-journey" key={journey.id}><div><span>{folders.find((folder) => folder.id === journey.folderId)?.name ?? "Unfoldered"}</span><strong>{journey.title}</strong><small>{journey.videoIds.length} videos / {journey.isPublic ? "Published" : "Draft"}</small></div><button className="text-button compact" onClick={() => onEdit(journey)}>Edit</button></article>)}</aside><SequenceView title={draftVideos.length ? "Current journey" : "Journey draft"} groups={groups} videos={draftVideos.length ? draftVideos : videos.slice(0, 6)} onAdd={onAdd} shareUrl={shareUrl} /></section>;
}

function MetricsView({ metrics, videos, sources, journeys, contacts, tracking }: { metrics: MetricsState; videos: DbVideo[]; sources: SourceRow[]; journeys: JourneySummary[]; contacts: ContactRow[]; tracking: TrackingState }) {
  const opens = metrics.views.filter((event) => event.event_type === "opened");
  const starts = metrics.views.filter((event) => event.event_type === "video_started");
  const ctas = metrics.views.filter((event) => event.event_type === "cta_clicked");
  const redirects = tracking.events.filter((event) => event.eventType === "redirect");
  const linkPageViews = tracking.events.filter((event) => event.eventType === "page_view");
  const linkCtas = tracking.events.filter((event) => event.eventType === "cta_click");
  const linkConversions = tracking.events.filter((event) => TRACKING_CONVERSION_TYPES.includes(event.eventType as (typeof TRACKING_CONVERSION_TYPES)[number]));
  const linkSummaries = buildTrackingLinkSummaries(tracking.links, tracking.events);
  const attributedRevenue = linkSummaries.reduce((sum, summary) => sum + summary.revenue, 0);
  const viewers = new Set(metrics.views.map((event) => event.viewer_label || event.metadata?.viewerId).filter(Boolean));
  const journeyRows = journeys.map((journey) => ({ journey, opens: opens.filter((event) => event.journey_id === journey.id).length, starts: starts.filter((event) => event.journey_id === journey.id).length, ctas: ctas.filter((event) => event.journey_id === journey.id).length }));
  const videoRows = videos.map((video) => ({ video, starts: starts.filter((event) => event.video_id === video.id).length, ctas: ctas.filter((event) => event.video_id === video.id).length })).sort((a, b) => b.starts - a.starts).slice(0, 10);
  const contactEvents = metrics.views.filter((event) => event.metadata?.contactId);
  return <section className="metrics-board"><div className="metrics-intro"><div><span>Metrics</span><h2>What content moves buyers?</h2></div><p>A tighter scoreboard up top, then ranked proof assets beneath it. This view should help you see what earns attention, what gets clicked, and which links start producing downstream conversion signals.</p></div><div className="metrics-scoreboard"><MetricCard label="Journey opens" value={String(opens.length)} detail="Public or contact-specific journey page opens." /><MetricCard label="Video starts" value={String(starts.length)} detail="Videos started inside journeys." /><MetricCard label="Tracked redirects" value={String(redirects.length)} detail="First-click hits through /t/{slug}." /><MetricCard label="Tracked conversions" value={String(linkConversions.length)} detail={`${rate(linkConversions.length, Math.max(linkPageViews.length, 1))} of destination page views converted.`} /><MetricCard label="Attributed revenue" value={formatCurrencyValue(attributedRevenue)} detail="Purchase value captured against tracked links." /><MetricCard label="CTA rate" value={rate(ctas.length + linkCtas.length, opens.length + linkPageViews.length)} detail="Click-through across journeys and tracked destinations." /></div><div className="metrics-rank-grid"><MetricPanel title="Top journeys" countLabel={`${journeyRows.length} journeys`} emptyLabel="No journey activity yet." rows={journeyRows.filter((row) => row.opens || row.starts || row.ctas).sort((a, b) => b.opens - a.opens || b.starts - a.starts || b.ctas - a.ctas).slice(0, 6).map((row) => ({ title: row.journey.title, meta: `${row.opens} opens`, detail: `${row.starts} starts / ${row.ctas} CTA clicks` }))} /><MetricPanel title="Top videos" countLabel={`${videoRows.length} ranked`} emptyLabel="No video starts yet." rows={videoRows.filter((row) => row.starts || row.ctas).slice(0, 6).map((row) => ({ title: row.video.title, meta: `${row.starts} starts`, detail: `${row.ctas} CTA clicks / ${row.video.sales_category ?? formatPlatformLabel(row.video.source_platform)}` }))} /><MetricPanel title="Top tracked links" countLabel={`${linkSummaries.length} live links`} emptyLabel="No tracked-link activity yet." rows={linkSummaries.filter((summary) => summary.redirects || summary.pageViews || summary.conversionCount).slice(0, 6).map((summary) => ({ title: summary.link.title, meta: `${summary.redirects} redirects / ${summary.pageViews} views`, detail: `${summary.conversionCount} conversions / ${formatCurrencyValue(summary.revenue, summary.currency)}` }))} /></div><div className="metrics-secondary-grid"><section className="metrics-secondary-panel"><div className="mini-head"><span>Contacts</span><strong>{contacts.length}</strong></div><div className="metric-grid metrics-secondary-cards"><MetricCard label="Known viewers" value={String(viewers.size)} detail="Anonymous viewer IDs plus future contacts." /><MetricCard label="Contact events" value={String(contactEvents.length)} detail="Events attached to contact-specific journey links." /><MetricCard label="Sent journeys" value={String(new Set(contactEvents.map((event) => event.metadata?.sendId).filter(Boolean)).size)} detail="Tracked contact-specific links with activity." /><MetricCard label="CTA from contacts" value={String(ctas.filter((event) => event.metadata?.contactId).length)} detail="CTA clicks from known sends." /></div></section><section className="metrics-secondary-panel"><div className="mini-head"><span>Source footprint</span><strong>{sources.length}</strong></div><div className="metric-grid metrics-secondary-cards"><MetricCard label="Sources" value={String(sources.length)} detail="Connected public/imported sources." /><MetricCard label="Videos" value={String(videos.length)} detail="Imported workspace videos." /><MetricCard label="Drive sources" value={String(sources.filter((source) => source.platform === "google_drive").length)} detail="Public Drive folders." /><MetricCard label="YouTube sources" value={String(sources.filter((source) => source.platform === "youtube").length)} detail="Videos, playlists, channels, RSS/API imports." /></div></section></div></section>;
}

function LinkTrackingView({ draft, journeys, tracking, working, onDraftChange, onCreate }: { draft: TrackingDraft; journeys: JourneySummary[]; tracking: TrackingState; working: boolean; onDraftChange: (draft: TrackingDraft) => void; onCreate: (event: FormEvent<HTMLFormElement>) => void }) {
  const summaries = buildTrackingLinkSummaries(tracking.links, tracking.events);
  const totalUniqueVisits = new Set(tracking.events.map((event) => event.visitId).filter(Boolean)).size;
  const totalUniqueVisitors = new Set(tracking.events.map((event) => event.visitorId || event.sessionId).filter(Boolean)).size;
  const totalRevenue = summaries.reduce((sum, summary) => sum + summary.revenue, 0);
  const totalConversions = summaries.reduce((sum, summary) => sum + summary.conversionCount, 0);
  const installOrigin = summaries[0]?.link.trackingUrl ? getOriginFromUrl(summaries[0].link.trackingUrl) : "";
  const journeyLookup = Object.fromEntries(journeys.map((journey) => [journey.id, journey]));
  const totalCtaRate = rate(tracking.events.filter((event) => event.eventType === "cta_click").length, Math.max(tracking.events.filter((event) => event.eventType === "page_view").length, 1));

  return <section className="tracking-studio"><section className="tracking-side-stack"><section className="workflow-panel tracking-panel tracking-create-panel"><div className="mini-head"><span>Operations studio</span><strong>{tracking.links.length} live links</strong></div><div className="tracking-panel-copy"><h2>Create tracked redirects without leaving the workflow.</h2><p>Every link becomes a measurable handoff. Tie it to a journey when needed, then keep first-click attribution and destination-site events attached to the original trust path.</p></div><form className="brief-grid tracking-form" onSubmit={onCreate}><label><span>Link title</span><input value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} placeholder="Estimate request CTA" required /></label><label><span>Destination URL</span><input value={draft.destinationUrl} onChange={(event) => onDraftChange({ ...draft, destinationUrl: event.target.value })} placeholder="https://your-site.com/landing-page" required /></label><label className="wide-field"><span>Journey</span><select value={draft.journeyId} onChange={(event) => onDraftChange({ ...draft, journeyId: event.target.value })}><option value="">None</option>{journeys.map((journey) => <option key={journey.id} value={journey.id}>{journey.title}</option>)}</select></label><button className="wide-action" disabled={working}>{working ? <Loader2 className="spin" /> : <MousePointerClick />}Create tracking link</button></form></section><section className="focus-panel tracking-panel tracking-install-panel"><div className="mini-head"><span>Install tc.js</span><strong>Use the script on the destination site</strong></div><div className="workflow-steps tracking-install-steps"><article className="workflow-step"><i>1</i><div><strong>Route every CTA through a tracking link</strong><small>Use the generated <code>/t/{`{slug}`}</code> link anywhere the trust path starts.</small></div></article><article className="workflow-step"><i>2</i><div><strong>Install the script on the destination page or site</strong><code>{installOrigin ? `<script async src="${installOrigin}/tc.js"></script>` : `<script async src="https://your-app-domain.com/tc.js"></script>`}</code></div></article><article className="workflow-step"><i>3</i><div><strong>Capture the moments that matter</strong>{TRACKING_INSTALL_EXAMPLES.map((example) => <code key={example}>{example}</code>)}</div></article></div><p className="tracking-install-note">Automatic capture includes page views, <code>data-tc-cta</code> clicks, and <code>data-tc-form</code> submissions. Add <code>window.TrustCompression.identify</code> later when you want known lead or customer data tied to the visit.</p></section></section><section className="recommendation-board tracking-links-board tracking-operations-board"><div className="mini-head"><span>Tracked links</span><strong>{tracking.events.length} events captured</strong></div><div className="tracking-board-intro"><h2>Scan active redirects and see which ones are actually moving buyers.</h2><p>Keep the operational actions close to the performance signal: copy the redirect, install the script, and check which links are earning visits, landing views, CTA clicks, and downstream conversions.</p></div><div className="tracking-overview tracking-overview-compact"><MetricCard label="Tracked links" value={String(tracking.links.length)} detail="Active redirects in this workspace." /><MetricCard label="Unique visits" value={String(totalUniqueVisits)} detail="Distinct first-click visits across all tracked links." /><MetricCard label="Tracked conversions" value={String(totalConversions)} detail="Forms, opt-ins, bookings, and purchases attributed after the redirect." /><MetricCard label="Attributed revenue" value={formatCurrencyValue(totalRevenue)} detail="Purchase value captured through tc.js." /><MetricCard label="Known visitors" value={String(totalUniqueVisitors)} detail="Distinct browser identities seen across tracked destinations." /><MetricCard label="CTA rate" value={totalCtaRate} detail="Destination CTA clicks divided by destination page views." /></div>{summaries.length ? <div className="tracking-link-list">{summaries.map((summary) => { const journey = summary.link.journeyId ? journeyLookup[summary.link.journeyId] : null; const scriptTag = getTrackingScriptTag(summary.link); return <article className="tracking-link-card" key={summary.link.id}><div className="tracking-link-header"><div><span>{summary.link.slug}</span><h3>{summary.link.title}</h3><p>{summary.link.destinationUrl}</p></div><div className="tracking-link-stats"><strong>{summary.redirects}</strong><small>redirects</small><strong>{summary.pageViews}</strong><small>landing views</small><strong>{formatCurrencyValue(summary.revenue, summary.currency)}</strong><small>revenue</small></div></div><div className="tracking-link-badge-row"><span className="tracking-badge">{journey ? "Journey linked" : "Standalone link"}</span><strong>{journey?.title ?? "No journey attached"}</strong><small>{formatDateTime(summary.lastTouch) ? `Last activity ${formatDateTime(summary.lastTouch)}` : "No activity yet"}</small></div><div className="tracking-link-detail-grid"><div><strong>{summary.uniqueVisits}</strong><small>unique visits</small></div><div><strong>{summary.uniqueVisitors}</strong><small>unique visitors</small></div><div><strong>{rate(summary.pageViews, Math.max(summary.redirects, 1))}</strong><small>landing rate</small></div><div><strong>{rate(summary.ctas, Math.max(summary.pageViews, 1))}</strong><small>cta rate</small></div><div><strong>{summary.formSubmits}</strong><small>form submits</small></div><div><strong>{summary.optIns}</strong><small>opt-ins</small></div><div><strong>{summary.bookings}</strong><small>bookings</small></div><div><strong>{summary.purchases}</strong><small>purchases</small></div></div><div className="tracking-signal-grid"><div><span>Top destination pages</span><strong>{summary.topPages.length ? summary.topPages.join(" · ") : "Waiting for page views"}</strong></div><div><span>Top referrers</span><strong>{summary.topReferrers.length ? summary.topReferrers.join(" · ") : "Direct or unknown"}</strong></div><div><span>Strongest events</span><strong>{summary.topEvents.length ? summary.topEvents.join(" · ") : "No downstream signals yet"}</strong></div></div><div className="tracking-link-actions"><a className="text-link" href={summary.link.trackingUrl} target="_blank" rel="noreferrer">{summary.link.trackingUrl}</a><code>{scriptTag}</code><div className="tracking-link-button-row"><button className="text-button compact" type="button" onClick={() => navigator.clipboard?.writeText(summary.link.trackingUrl)}><Copy />Copy link</button><button className="text-button compact" type="button" onClick={() => navigator.clipboard?.writeText(scriptTag)}><Copy />Copy script</button></div></div></article>; })}</div> : <div className="tracking-empty-state"><span>Tracked links</span><h3>No tracked links yet.</h3><p>Start with one CTA destination, route it through <code>/t/{`{slug}`}</code>, then install <code>/tc.js</code> on the destination page so the full path can be measured.</p></div>}</section></section>;
}

function MetricPanel({ title, countLabel, rows, emptyLabel }: { title: string; countLabel: string; rows: Array<{ title: string; meta: string; detail: string }>; emptyLabel: string }) {
  return <section className="metric-panel"><div className="mini-head"><span>{title}</span><strong>{countLabel}</strong></div>{rows.length ? <div className="metric-list metric-rank-list">{rows.map((row, index) => <article className="metric-rank-row" key={`${row.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{row.title}</strong><small>{row.meta}</small></div><p>{row.detail}</p></article>)}</div> : <p className="metric-empty">{emptyLabel}</p>}</section>;
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>;
}

function SequenceView({ title, videos, groups, onAdd, shareUrl }: { title: string; videos: DbVideo[]; groups: SmartGroup[]; onAdd: (video: DbVideo) => void; shareUrl?: string }) {
  return <section className="recommendation-board"><div className="mini-head"><span>{title}</span>{shareUrl && <a className="text-link" href={shareUrl} target="_blank" rel="noreferrer">Open share link</a>}</div>{groups.length > 0 && <SmartGroups groups={groups.slice(0, 3)} onSelect={() => undefined} onAdd={onAdd} compact />}<div>{videos.map((video, index) => <div className="sequence-item" key={video.id}><span>{index + 1}</span><div><strong>{video.title}</strong><small>{video.sales_category ?? video.source_platform} / {formatDuration(video.duration_seconds)}</small></div><button className="icon-mini" onClick={() => onAdd(video)} aria-label={`Add ${video.title} to journey`}><Plus /></button></div>)}</div></section>;
}

function SmartGroups({ groups, onSelect, onAdd, compact = false }: { groups: SmartGroup[]; onSelect: (video: DbVideo) => void; onAdd: (video: DbVideo) => void; compact?: boolean }) {
  return <section className={compact ? "smart-groups is-compact" : "smart-groups"}>{groups.map((group) => <article className="smart-group" key={group.key}><div><span>Recommended path</span><h3>{group.title}</h3></div><div className="smart-strip">{group.videos.slice(0, 4).map((video) => <button className="smart-video" key={video.id} onClick={() => onSelect(video)}><span style={{ backgroundImage: `url(${video.thumbnail_url ?? ""})` }} /><strong>{video.title}</strong><small>{video.funnel_stage ?? video.buying_stage ?? "Library"}</small><i onClick={(event) => { event.stopPropagation(); onAdd(video); }}><Plus /></i></button>)}</div></article>)}</section>;
}

function JourneyTray({ draft, videos, working, shareUrl, contacts, selectedJourneyId, options, onDraftChange, onGenerate, onPublish, onMove, onRemove, onCreateContactShare }: { draft: JourneyDraft; videos: DbVideo[]; working: boolean; shareUrl: string; contacts: ContactRow[]; selectedJourneyId: string | null; options: ReturnType<typeof buildOptions>; onDraftChange: (draft: JourneyDraft) => void; onGenerate: () => void; onPublish: () => void; onMove: (videoId: string, direction: -1 | 1) => void; onRemove: (videoId: string) => void; onCreateContactShare: (contact: { contactId?: string; name?: string; email?: string; company?: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [contact, setContact] = useState({ name: "", email: "", company: "" });
  return <aside className={open ? "journey-tray is-open" : "journey-tray"}><button className="tray-tab" onClick={() => setOpen((current) => !current)}><Route /><span>{videos.length} in journey</span></button><div className="tray-body"><Datalists options={options} /><div className="mini-head"><span>{selectedJourneyId ? "Edit journey" : "Draft journey"}</span><button className="icon-mini" onClick={() => setOpen(false)} aria-label="Close journey tray"><ChevronDown /></button></div><label><span>Title</span><input value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} placeholder="Proof journey" /></label><label><span>Folder</span><input list="folders" value={draft.folderName} onChange={(event) => onDraftChange({ ...draft, folderName: event.target.value })} placeholder="Pricing objections" /></label><label><span>Heading</span><input value={draft.heading} onChange={(event) => onDraftChange({ ...draft, heading: event.target.value })} placeholder="A focused proof path." /></label><label><span>Description</span><textarea value={draft.description} onChange={(event) => onDraftChange({ ...draft, description: event.target.value })} placeholder="What this journey helps the viewer understand." /></label><div className="brief-grid"><label><span>CTA</span><input value={draft.ctaLabel} onChange={(event) => onDraftChange({ ...draft, ctaLabel: event.target.value })} /></label><label><span>CTA URL</span><input value={draft.ctaUrl} onChange={(event) => onDraftChange({ ...draft, ctaUrl: event.target.value })} placeholder="https://..." /></label></div><div className="tray-list">{videos.map((video, index) => <article className="tray-item" key={video.id}><span>{index + 1}</span><strong>{video.title}</strong><button className="icon-mini" disabled={index === 0} onClick={() => onMove(video.id, -1)} aria-label="Move up"><ChevronUp /></button><button className="icon-mini" disabled={index === videos.length - 1} onClick={() => onMove(video.id, 1)} aria-label="Move down"><ChevronDown /></button><button className="icon-mini" onClick={() => onRemove(video.id)} aria-label="Remove video"><Trash2 /></button></article>)}</div><div className="tray-actions"><button className="seed-button" disabled={working || !videos.length} onClick={onGenerate}>{working ? <Loader2 className="spin" /> : <Wand2 />}Generate</button><button className="wide-action" disabled={working || !videos.length} onClick={onPublish}>{working ? <Loader2 className="spin" /> : <Share2 />}{selectedJourneyId ? "Update" : "Publish"}</button></div>{selectedJourneyId && <section className="contact-share"><span>Send to contact</span><select value={contactId} onChange={(event) => setContactId(event.target.value)}><option value="">New contact</option>{contacts.map((item) => <option value={item.id} key={item.id}>{item.name || item.email || "Unnamed"}</option>)}</select>{!contactId && <><input value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} placeholder="Contact name" /><input value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} placeholder="email@company.com" /><input value={contact.company} onChange={(event) => setContact({ ...contact, company: event.target.value })} placeholder="Company" /></>}<button className="seed-button" disabled={working} onClick={() => onCreateContactShare(contactId ? { contactId } : contact)}><Send />Create link</button></section>}{shareUrl && <a className="share-link" href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a>}</div></aside>;
}

function SimpleGate({ title, body, onBack }: { title: string; body: string; onBack: () => void }) {
  return <main className="role-gate"><button className="text-button" onClick={onBack}>Back</button><section className="gate-intro"><span>Setup</span><h1>{title}</h1><p>{body}</p></section></main>;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "--";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatPlatformLabel(value: string) {
  return value.replace(/_/g, " ");
}

function formatSourceStatus(value: string | null) {
  const next = value?.trim();
  return next ? next.replace(/_/g, " ") : "unknown";
}

function formatPublishedLabel(video: DbVideo) {
  const value = video.published_at ?? video.created_at;
  if (!value) return "Unscheduled";
  return formatShortDate(value) ?? "Unscheduled";
}

function filterVideos(videos: DbVideo[], query: string, filters: LibraryFilters) {
  return videos.filter((video) => {
    const context = video.metadata?.customContext ?? {};
    const haystack = [video.title, video.source_platform, video.summary, video.suggested_use, video.proof_type, video.buying_stage, video.sales_category, video.funnel_stage, context.notes, context.targetBuyer, context.objections, context.offer, ...video.tags].join(" ").toLowerCase();
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

function buildOptions(videos: DbVideo[], folders: FolderRow[]) {
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
  } as Record<string, string[]>;
}

function buildSmartGroups(videos: DbVideo[]): SmartGroup[] {
  const buckets = videos.reduce<Record<string, DbVideo[]>>((groups, video) => {
    const category = video.sales_category ?? video.proof_type ?? "Education";
    groups[category] = [...(groups[category] ?? []), video];
    return groups;
  }, {});
  const titleMap: Record<string, string> = { Objection: "Handle the hard questions", Testimonial: "Build trust with customer proof", "Product proof": "Show the work clearly", Education: "Teach before the call", "Founder story": "Make the company feel human", "Case study": "Show the transformation", FAQ: "Answer the obvious questions", Comparison: "Help buyers compare options", "Risk reversal": "Lower the perceived risk" };
  return Object.entries(buckets).map(([key, groupVideos]) => ({ key, title: titleMap[key] ?? key, videos: groupVideos })).sort((a, b) => b.videos.length - a.videos.length).slice(0, 6);
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function rate(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function buildTrackingLinkSummaries(links: TrackingLinkRow[], events: TrackingEventRow[]): TrackingLinkSummary[] {
  return links.map((link) => {
    const linkEvents = events.filter((event) => event.trackingLinkId === link.id);
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
    const lastTouch = [...linkEvents]
      .sort((a, b) => getTrackingTimestamp(b) - getTrackingTimestamp(a))[0]
      ?.occurredAt ?? link.createdAt;

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
      lastTouch,
      topPages: summarizeTopValues(linkEvents.map((event) => compactTrackingPage(event.pageUrl))),
      topReferrers: summarizeTopValues(linkEvents.map((event) => compactTrackingReferrer(event.referrerUrl))),
      topEvents: summarizeTopValues(linkEvents.filter((event) => event.eventType !== "redirect").map((event) => event.eventLabel ?? formatEventTypeLabel(event.eventType)))
    };
  }).sort((a, b) => new Date(b.lastTouch ?? 0).getTime() - new Date(a.lastTouch ?? 0).getTime());
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

function formatCurrencyValue(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value || 0);
}

function formatDateTime(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString();
}

function formatShortDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString();
}

function getOriginFromUrl(value: string) {
  try {
    return new URL(value).origin;
  } catch (_error) {
    return "";
  }
}

function getTrackingScriptTag(link: TrackingLinkRow) {
  const origin = getOriginFromUrl(link.trackingUrl) || "https://your-app-domain.com";
  return `<script async src="${origin}/tc.js" data-link-slug="${link.slug}"></script>`;
}
