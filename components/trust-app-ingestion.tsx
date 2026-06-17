"use client";

import {
  Archive,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Copy,
  Eye,
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
type MetricMode = "overview" | "journeys" | "videos" | "contacts" | "social" | "links";

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
  eventType: "redirect" | "page_view" | "cta_click";
  visitId: string | null;
  visitorId: string | null;
  sessionId: string | null;
  pageUrl: string | null;
  referrerUrl: string | null;
  metadata: Record<string, any> | null;
  createdAt: string | null;
};

type TrackingState = {
  links: TrackingLinkRow[];
  events: TrackingEventRow[];
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
  }, [isInternal, session, supabase, workspaceBooted]);

  async function loadVideos(nextWorkspaceId = workspaceId) {
    if (!supabase || !nextWorkspaceId) return;
    const { data, error: loadError } = await supabase
      .from("videos")
      .select("id,title,source_platform,source_url,embed_url,thumbnail_url,duration_seconds,summary,suggested_use,proof_type,buying_stage,sales_category,funnel_stage,published_at,created_at,metadata,tags")
      .eq("workspace_id", nextWorkspaceId)
      .is("deleted_at", null)
      .order("published_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

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

  if (!roleId || !role) return <RoleGate onChoose={chooseRole} />;
  if (loading && !workspaceBooted) return <main className="role-gate"><Loader2 className="spin" /><h1>Opening workspace.</h1></main>;
  if (!supabase && isInternal) return <SimpleGate title="Supabase is not configured." body="Add the Supabase public URL and publishable key in Vercel." onBack={() => setRoleId(null)} />;
  if (!session && isInternal) return <AuthGate role={role} supabase={supabase} onBack={() => setRoleId(null)} />;

  return (
    <div className="app">
      <aside className="side" aria-label="Workspace">
        <button className="mark" onClick={() => setRoleId(null)} aria-label="Switch role">T</button>
        <nav className="side-nav">
          <button className={view === "sources" ? "icon-button is-active" : "icon-button"} onClick={() => setView("sources")} aria-label="Sources" title="Sources"><Import /><span>Sources</span></button>
          <button className={view === "library" ? "icon-button is-active" : "icon-button"} onClick={() => setView("library")} aria-label="Library" title="Library"><Clapperboard /><span>Library</span></button>
          <button className={view === "tracking" ? "icon-button is-active" : "icon-button"} onClick={() => setView("tracking")} aria-label="Link tracking" title="Link tracking"><Link2 /><span>Links</span></button>
          <button className={view === "metrics" ? "icon-button is-active" : "icon-button"} onClick={() => setView("metrics")} aria-label="Sales metrics" title="Metrics"><BarChart3 /><span>Metrics</span></button>
          <button className={view === "journeys" ? "icon-button is-active" : "icon-button"} onClick={newJourney} aria-label="Journeys" title="Journeys"><Route /><span>Journeys</span></button>
        </nav>
        {session && <button className="icon-button" onClick={() => supabase?.auth.signOut()} aria-label="Sign out" title="Sign out"><LogOut /><span>Exit</span></button>}
      </aside>

      <main className="stage">
        <header className="command-bar">
          <div className="brand-line"><span>{role.label}</span><strong>Trust Library</strong></div>
          <label className="command-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={role.placeholder} /></label>
          <button className="connect-button" onClick={() => setRoleId(null)}><Eye />Switch</button>
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
