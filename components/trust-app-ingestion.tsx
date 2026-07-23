"use client";

import {
  ArrowUpRight,
  BarChart3,
  Building2,
  Clapperboard,
  Import,
  Link2,
  Loader2,
  LogOut,
  RefreshCw,
  Route,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { SocialProfileReportPage } from "@/components/social-profile-report-page";
import {
  AuthGate,
  LibraryFiltersBar,
  mapLibraryAssetRow,
  mapSocialProfileRow,
  mapWorkspaceInviteRow,
  mapWorkspaceMemberRow,
  mapWorkspaceRow,
  readRememberedWorkspaceId,
  rememberWorkspaceId,
  RoleGate,
  type RoleDefinition,
  type RoleId,
  SimpleGate,
  SourcesView,
  WorkspaceView,
  type ViewId,
} from "@/components/trust-app-shell";
import { LinkTrackingView, MetricsView } from "@/components/trust-app-attribution-ui";
import { JourneyTray, JourneysView, LibraryConfigurator } from "@/components/trust-app-library-ui";
import { SocialProfilesView } from "@/components/trust-app-social-profiles";
import { normalizeJourneyEmbed } from "@/lib/journey-embeds";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  buildJourneyAssetFromVideo,
  buildOptions,
  buildSmartGroups,
  filterVideos,
  formatPlatformLabel,
  type ContactRow,
  type DbVideo,
  type FolderRow,
  type JourneyAsset,
  type JourneyDraft,
  type JourneyEmbedDraft,
  type JourneySummary,
  type JourneyViewRow,
  type LibraryAssetRow,
  type LibraryFilters,
  type MetricsState,
  type SocialProfileDraft,
  type SocialProfileRow,
  type SourceRow,
  type TrackingDraft,
  type TrackingIdentityRow,
  type TrackingLinkRow,
  type TrackingState,
  type TrackingEventRow,
  type VideoContext,
  type WorkspaceInviteRow,
  type WorkspaceMemberRow,
  type WorkspaceRow
} from "@/components/trust-app-shared";

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

const emptyJourneyEmbedDraft: JourneyEmbedDraft = {
  title: "",
  url: ""
};

const emptySocialProfileDraft: SocialProfileDraft = {
  platform: "instagram",
  profileUrl: "",
  username: "",
  displayName: "",
  avatarUrl: "",
  businessProfileLabel: "",
};

const roles: Record<RoleId, RoleDefinition> = {
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

const viewTitles: Record<ViewId, string> = {
  library: "Trust Library",
  sources: "Sources",
  socialProfiles: "Social Profiles",
  tracking: "Link Tracking",
  journeys: "Journeys",
  metrics: "Metrics",
  workspace: "Workspace"
};

export function TrustAppIngestion({
  initialView = "library",
  initialSocialProfileReportId = null,
}: {
  initialView?: ViewId;
  initialSocialProfileReportId?: string | null;
} = {}) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [roleId, setRoleId] = useState<RoleId | null>("libraryManager");
  const [view, setView] = useState<ViewId>(initialView);
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [libraryAssets, setLibraryAssets] = useState<LibraryAssetRow[]>([]);
  const [workspaceInvites, setWorkspaceInvites] = useState<WorkspaceInviteRow[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRow[]>([]);
  const [videos, setVideos] = useState<DbVideo[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [tracking, setTracking] = useState<TrackingState>({ links: [], events: [], identities: [] });
  const [socialProfiles, setSocialProfiles] = useState<SocialProfileRow[]>([]);
  const [selected, setSelected] = useState<DbVideo | null>(null);
  const [selectedSocialProfileId, setSelectedSocialProfileId] = useState<string | null>(null);
  const [socialProfileReportId, setSocialProfileReportId] = useState<string | null>(initialSocialProfileReportId);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsState>({ views: [] });
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<LibraryFilters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [workspaceBooted, setWorkspaceBooted] = useState(false);
  const [working, setWorking] = useState(false);
  const [draftAssets, setDraftAssets] = useState<JourneyAsset[]>([]);
  const [draft, setDraft] = useState<JourneyDraft>(emptyDraft);
  const [journeyEmbedDraft, setJourneyEmbedDraft] = useState<JourneyEmbedDraft>(emptyJourneyEmbedDraft);
  const [libraryAssetDraft, setLibraryAssetDraft] = useState<JourneyEmbedDraft>(emptyJourneyEmbedDraft);
  const [trackingDraft, setTrackingDraft] = useState<TrackingDraft>(emptyTrackingDraft);
  const [socialProfileDraft, setSocialProfileDraft] = useState<SocialProfileDraft>(emptySocialProfileDraft);
  const [inviteDraft, setInviteDraft] = useState({ email: "", role: "member" });
  const [createWorkspaceName, setCreateWorkspaceName] = useState("");
  const [renameWorkspaceName, setRenameWorkspaceName] = useState("");
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
  const pageTitle = viewTitles[view];
  const currentWorkspace = workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
  const canManageWorkspace = currentWorkspace?.role === "owner" || currentWorkspace?.role === "admin";
  const selectedReportProfile = socialProfileReportId ? socialProfiles.find((profile) => profile.id === socialProfileReportId) ?? null : null;

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
        setWorkspaces([]);
        setLibraryAssets([]);
        setWorkspaceInvites([]);
        setWorkspaceMembers([]);
        setVideos([]);
        setSources([]);
        setJourneys([]);
        setFolders([]);
        setContacts([]);
        setTracking({ links: [], events: [], identities: [] });
        setSocialProfiles([]);
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
      const nextWorkspaces = await loadWorkspaces();
      if (!active) return;

      let nextWorkspaceId = readRememberedWorkspaceId(nextWorkspaces);
      if (!nextWorkspaceId) {
        const { data: id, error: workspaceError } = await supabase.rpc("ensure_workspace", { workspace_name: "Trust Library" });
        if (!active) return;
        if (workspaceError || !id) {
          setError(workspaceError?.message ?? "Could not open workspace.");
          setLoading(false);
          return;
        }
        const refreshedWorkspaces = await loadWorkspaces();
        nextWorkspaceId = readRememberedWorkspaceId(refreshedWorkspaces) ?? String(id);
      }

      setWorkspaceId(nextWorkspaceId);
      rememberWorkspaceId(nextWorkspaceId);
      const openedWorkspace = nextWorkspaces.find((workspace) => workspace.id === nextWorkspaceId);
      setRenameWorkspaceName(openedWorkspace?.name ?? "");
      await refreshWorkspace(nextWorkspaceId);
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

  async function loadWorkspaces() {
    if (!session) return [] as WorkspaceRow[];
    const response = await fetch("/api/workspaces", {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (!response.ok) return [] as WorkspaceRow[];
    const result = (await response.json()) as { workspaces?: Array<Record<string, any>> };
    const nextWorkspaces = (result.workspaces ?? []).map(mapWorkspaceRow);
    setWorkspaces(nextWorkspaces);
    return nextWorkspaces;
  }

  async function loadLibraryAssets(nextWorkspaceId = workspaceId) {
    if (!session || !nextWorkspaceId) return;
    const response = await fetch(`/api/library-assets?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (!response.ok) {
      setLibraryAssets([]);
      return;
    }
    const result = (await response.json()) as { assets?: Array<Record<string, any>> };
    setLibraryAssets((result.assets ?? []).map(mapLibraryAssetRow));
  }

  async function loadWorkspaceInvites(nextWorkspaceId = workspaceId) {
    if (!session || !nextWorkspaceId) return;
    const response = await fetch(`/api/workspace/invites?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (!response.ok) {
      setWorkspaceInvites([]);
      return;
    }
    const result = (await response.json()) as { invites?: Array<Record<string, any>> };
    setWorkspaceInvites((result.invites ?? []).map(mapWorkspaceInviteRow));
  }

  async function loadWorkspaceMembers(nextWorkspaceId = workspaceId) {
    if (!session || !nextWorkspaceId) return;
    const response = await fetch(`/api/workspaces/${encodeURIComponent(nextWorkspaceId)}/members`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (!response.ok) {
      setWorkspaceMembers([]);
      return;
    }
    const result = (await response.json()) as { members?: Array<Record<string, any>> };
    setWorkspaceMembers((result.members ?? []).map(mapWorkspaceMemberRow));
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
    if (!session || !nextWorkspaceId) return;
    const response = await fetch(`/api/journey-contacts?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (!response.ok) {
      setContacts([]);
      return;
    }
    const result = (await response.json()) as { contacts?: ContactRow[] };
    setContacts(result.contacts ?? []);
  }

  async function loadTracking(nextWorkspaceId = workspaceId) {
    if (!session || !nextWorkspaceId) return;
    const response = await fetch(`/api/tracking-links?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (!response.ok) return;
    const result = (await response.json()) as { links?: TrackingLinkRow[]; events?: TrackingEventRow[]; identities?: TrackingIdentityRow[] };
    setTracking({ links: result.links ?? [], events: result.events ?? [], identities: result.identities ?? [] });
  }

  async function loadSocialProfiles(nextWorkspaceId = workspaceId) {
    if (!session || !nextWorkspaceId) return;
    const response = await fetch(`/api/social-profiles?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (!response.ok) return;
    const result = (await response.json()) as { profiles?: Array<Record<string, any>> };
    const nextProfiles = (result.profiles ?? []).map(mapSocialProfileRow);
    setSocialProfiles(nextProfiles);
    setSelectedSocialProfileId((current) => current && nextProfiles.some((profile) => profile.id === current) ? current : nextProfiles[0]?.id ?? null);
  }

  async function loadMetrics(nextWorkspaceId = workspaceId, nextJourneys = journeys) {
    if (!supabase || !nextWorkspaceId) return;
    const journeyIds = nextJourneys.map((journey) => journey.id);
    if (!journeyIds.length) {
      setMetrics({ views: [] });
      return;
    }
    const { data } = await supabase.from("journey_views").select("id,journey_id,video_id,asset_id,event_type,viewer_label,metadata,created_at").in("journey_id", journeyIds).order("created_at", { ascending: false });
    setMetrics({ views: (data ?? []) as JourneyViewRow[] });
  }

  async function refreshWorkspace(nextWorkspaceId = workspaceId) {
    await Promise.all([
      loadVideos(nextWorkspaceId),
      loadSources(nextWorkspaceId),
      loadContacts(nextWorkspaceId),
      loadSocialProfiles(nextWorkspaceId),
      loadLibraryAssets(nextWorkspaceId),
      loadWorkspaceInvites(nextWorkspaceId),
      loadWorkspaceMembers(nextWorkspaceId)
    ]);
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

  async function deleteSource(source: SourceRow) {
    if (!workspaceId || !session) return;
    if (!window.confirm(`Remove ${source.account_label ?? formatPlatformLabel(source.platform)} from connected sources? Imported videos will stay in the library.`)) return;

    setWorking(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/sources/${source.id}?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not delete that source.");
      setNotice("Source removed. Imported videos remain in the library.");
      await refreshWorkspace(workspaceId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not delete that source.");
    } finally {
      setWorking(false);
    }
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
      const response = await fe…4023 tokens truncated…ame: folders.find((folder) => folder.id === journey.folderId)?.name ?? ""
    });
    setDraftAssets(journey.assets);
    setShareUrl(journey.shareUrl ?? "");
  }

  function newJourney() {
    setSelectedJourneyId(null);
    setDraft(emptyDraft);
    setDraftAssets([]);
    setJourneyEmbedDraft(emptyJourneyEmbedDraft);
    setShareUrl("");
    setView("journeys");
  }

  async function generateJourney() {
    const draftVideos = draftAssets.filter((asset) => asset.videoId).map((asset) => videos.find((video) => video.id === asset.videoId)).filter(Boolean) as DbVideo[];
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
        setDraftAssets((current) =>
          [...current]
            .sort((a, b) => {
              const aRank = a.videoId ? result.orderedTitles?.indexOf(a.title) ?? 999 : 999;
              const bRank = b.videoId ? result.orderedTitles?.indexOf(b.title) ?? 999 : 999;
              return (aRank < 0 ? 999 : aRank) - (bRank < 0 ? 999 : bRank);
            })
            .map((item, index) => ({ ...item, position: index + 1 }))
        );
      }
      setNotice(result.source === "rules" ? "Organized with the no-AI fallback." : "AI generated the journey copy and order.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not generate journey copy.");
    } finally {
      setJourneyWorking(false);
    }
  }

  async function publishJourney() {
    if (!workspaceId || !session || !draftAssets.length) return;
    setJourneyWorking(true);
    setNotice("");
    setError("");
    try {
      const body = {
        workspaceId,
        ...draft,
        assets: draftAssets.map((asset) => ({
          libraryAssetId: asset.libraryAssetId ?? null,
          videoId: asset.videoId,
          assetType: asset.assetType,
          sourcePlatform: asset.sourcePlatform,
          title: asset.title,
          sourceUrl: asset.sourceUrl,
          embedUrl: asset.embedUrl,
          thumbnailUrl: asset.thumbnailUrl,
          durationSeconds: asset.durationSeconds,
          summary: asset.summary,
          note: asset.note,
          metadata: asset.metadata
        })),
        publish: true
      };
      const response = await fetch(selectedJourneyId ? `/api/journeys/${selectedJourneyId}` : "/api/journeys", { method: selectedJourneyId ? "PATCH" : "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
      const result = (await response.json()) as { id?: string; shareUrl?: string; error?: string };
      if (!response.ok || !result.shareUrl) throw new Error(result.error ?? "Could not publish the journey.");
      const absoluteUrl = new URL(result.shareUrl, window.location.origin).toString();
      const nextJourneyId = result.id ?? selectedJourneyId;
      setShareUrl(absoluteUrl);
      setSelectedJourneyId(nextJourneyId);
      setNotice(selectedJourneyId ? "Journey updated. The share link is ready." : "Journey published. The share link is ready.");
      const nextJourneys = await loadJourneys(workspaceId);
      await Promise.all([loadVideos(workspaceId), loadSources(workspaceId), loadContacts(workspaceId), loadSocialProfiles(workspaceId), loadTracking(workspaceId)]);
      await loadMetrics(workspaceId, nextJourneys ?? []);
      if (nextJourneyId) {
        const refreshed = (nextJourneys ?? []).find((journey) => journey.id === nextJourneyId);
        if (refreshed) hydrateJourneyDraft(refreshed);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not publish the journey.");
    } finally {
      setJourneyWorking(false);
    }
  }

  async function createContactShare(contact: { contactId?: string; name?: string; email?: string; company?: string; phone?: string; crmSource?: string; externalId?: string }) {
    if (!workspaceId || !session || !selectedJourneyId) return;
    setJourneyWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/journeys/${selectedJourneyId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          workspaceId,
          contactId: contact.contactId,
          contact: contact.contactId
            ? undefined
            : {
                name: contact.name,
                email: contact.email,
                company: contact.company,
                phone: contact.phone,
                crmSource: contact.crmSource,
                externalId: contact.externalId
              }
        })
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

  async function saveSocialProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !session) return;

    setWorking(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/social-profiles", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workspaceId,
          ...socialProfileDraft,
          analyze: true,
        })
      });
      const result = (await response.json()) as { profile?: Record<string, any>; mode?: string; error?: string };
      if (!response.ok || !result.profile) throw new Error(result.error ?? "Could not save the social profile.");

      const nextProfile = mapSocialProfileRow(result.profile);
      setSelectedSocialProfileId(nextProfile.id);
      setSocialProfileDraft(emptySocialProfileDraft);
      setNotice(result.mode === "updated" ? "Saved profile updated and re-analyzed." : "Social profile saved and analyzed.");
      await loadSocialProfiles(workspaceId);
      setView("socialProfiles");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not save the social profile.");
    } finally {
      setWorking(false);
    }
  }

  async function analyzeSocialProfile(profile: SocialProfileRow) {
    if (!workspaceId || !session) return;

    setWorking(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch(`/api/social-profiles/${profile.id}/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ workspaceId })
      });
      const result = (await response.json()) as { profile?: Record<string, any>; error?: string };
      if (!response.ok || !result.profile) throw new Error(result.error ?? "Could not analyze the saved profile.");
      setSelectedSocialProfileId(profile.id);
      setNotice(`Re-ran analysis for ${profile.displayName || profile.username || profile.platform}.`);
      await loadSocialProfiles(workspaceId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not analyze the saved profile.");
    } finally {
      setWorking(false);
    }
  }

  async function removeSocialProfile(profile: SocialProfileRow) {
    if (!workspaceId || !session) return;

    setWorking(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch(`/api/social-profiles/${profile.id}?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not remove the saved profile.");
      if (socialProfileReportId === profile.id) {
        setSocialProfileReportId(null);
        router.push("/");
      }
      setNotice("Saved profile removed.");
      await loadSocialProfiles(workspaceId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not remove the saved profile.");
    } finally {
      setWorking(false);
    }
  }

  async function importSocialProfile(profile: SocialProfileRow, mode: "channel" | "video", videoId?: string) {
    if (!workspaceId || !session) return;

    setWorking(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch(`/api/social-profiles/${profile.id}/import`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ workspaceId, mode, videoId })
      });
      const result = (await response.json()) as {
        result?: { imported?: number; updated?: number; skippedDuplicates?: number; duplicateCandidates?: number };
        error?: string;
      };
      if (!response.ok || !result.result) throw new Error(result.error ?? "Could not import from that social profile.");
      setNotice(`Imported ${result.result.imported ?? 0}, updated ${result.result.updated ?? 0}, skipped ${result.result.skippedDuplicates ?? 0}, flagged ${result.result.duplicateCandidates ?? 0}.`);
      await refreshWorkspace(workspaceId);
      await analyzeSocialProfile(profile);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not import from that social profile.");
    } finally {
      setWorking(false);
    }
  }

  function chooseRole(nextRole: RoleId) {
    setRoleId(nextRole);
    setView(roles[nextRole].view);
    setNotice("");
    setError("");
  }

  function goHome() {
    setSocialProfileReportId(null);
    router.push("/");
    setView("library");
    setNotice("");
    setError("");
  }

  function closeSocialProfileReport() {
    setSocialProfileReportId(null);
    setView("socialProfiles");
    router.push("/");
  }

  if (!roleId || !role) return <RoleGate onChoose={chooseRole} roles={roles} />;
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
          <button className={view === "socialProfiles" ? "icon-button is-active" : "icon-button"} onClick={() => { setView("socialProfiles"); setSocialProfileReportId(null); router.push("/"); }} aria-label="Social Profiles" title="Social Profiles"><UserRound /><span>Social Profiles</span></button>
          <button className={view === "tracking" ? "icon-button is-active" : "icon-button"} onClick={() => setView("tracking")} aria-label="Link tracking" title="Link tracking"><Link2 /><span>Links</span></button>
          <button className={view === "metrics" ? "icon-button is-active" : "icon-button"} onClick={() => setView("metrics")} aria-label="Sales metrics" title="Metrics"><BarChart3 /><span>Metrics</span></button>
          <button className={view === "journeys" ? "icon-button is-active" : "icon-button"} onClick={newJourney} aria-label="Journeys" title="Journeys"><Route /><span>Journeys</span></button>
          <button className={view === "workspace" ? "icon-button is-active" : "icon-button"} onClick={() => setView("workspace")} aria-label="Workspace" title="Workspace"><Building2 /><span>Workspace</span></button>
        </nav>
        {session && <button className="icon-button" onClick={() => supabase?.auth.signOut()} aria-label="Sign out" title="Sign out"><LogOut /><span>Exit</span></button>}
      </aside>

      <main className="stage">
        <header className="command-bar">
          <div className="brand-line"><span>{role.label}</span><strong>{pageTitle}</strong></div>
          {currentWorkspace && (
            <label className="workspace-switcher">
              <span>{currentWorkspace.role} workspace</span>
              <select value={workspaceId ?? ""} onChange={(event) => void switchWorkspace(event.target.value)}>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {showCommandSearch ? <label className="command-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={role.placeholder} /></label> : <div className="command-spacer" aria-hidden="true" />}
        </header>

        {view === "library" && <LibraryFiltersBar filters={filters} options={options} onChange={setFilters} />}

        {view !== "workspace" && (
          <section className="role-context is-quiet"><span>{role.label}</span><h2>{role.title}</h2><p>{role.description}</p></section>
        )}
        {(notice || error) && <p style={{ margin: "0 6px 18px", color: error ? "#ffd4d4" : "#d8d1c5" }}>{error || notice}</p>}

        {view === "sources" && <SourcesView sources={sources} importing={working} onImport={importSource} onReimport={reimportSource} onDelete={deleteSource} />}
        {view === "workspace" && <WorkspaceView workspace={currentWorkspace} workspaces={workspaces} members={workspaceMembers} invites={workspaceInvites} canManage={canManageWorkspace} working={working} createName={createWorkspaceName} renameName={renameWorkspaceName} inviteDraft={inviteDraft} onCreateNameChange={setCreateWorkspaceName} onRenameNameChange={setRenameWorkspaceName} onInviteDraftChange={setInviteDraft} onCreate={createWorkspace} onRename={renameWorkspace} onInvite={inviteWorkspaceMember} onSwitch={switchWorkspace} onMemberRoleChange={updateWorkspaceMemberRole} onRemoveMember={removeWorkspaceMember} onRevokeInvite={revokeWorkspaceInvite} />}
        {view === "library" && <LibraryConfigurator videos={visibleVideos} libraryAssets={libraryAssets} assetDraft={libraryAssetDraft} selected={selected} saving={working} options={options} onSelect={setSelected} onAdd={addToJourney} onAssetDraftChange={setLibraryAssetDraft} onSaveAsset={saveLibraryAsset} onAddAsset={addLibraryAssetToJourney} onDeleteAsset={deleteLibraryAsset} onArchive={archiveVideo} onSaveContext={saveVideoContext} />}
        {view === "socialProfiles" && socialProfileReportId && (
          <SocialProfileReportPage
            profile={selectedReportProfile}
            working={working}
            onBack={closeSocialProfileReport}
            onRefresh={() => selectedReportProfile ? analyzeSocialProfile(selectedReportProfile) : undefined}
            onImportChannel={() => selectedReportProfile ? importSocialProfile(selectedReportProfile, "channel") : undefined}
            onImportVideo={(videoId) => selectedReportProfile ? importSocialProfile(selectedReportProfile, "video", videoId) : undefined}
          />
        )}
        {view === "socialProfiles" && !socialProfileReportId && (
          <SocialProfilesView
            draft={socialProfileDraft}
            profiles={socialProfiles}
            selectedProfileId={selectedSocialProfileId}
            working={working}
            onDraftChange={setSocialProfileDraft}
            onSave={saveSocialProfile}
            onAnalyze={analyzeSocialProfile}
            onRemove={removeSocialProfile}
          />
        )}
        {view === "tracking" && <LinkTrackingView draft={trackingDraft} journeys={journeys} tracking={tracking} working={trackingWorking} onDraftChange={setTrackingDraft} onCreate={createTrackingLink} />}
        {view === "metrics" && <MetricsView metrics={metrics} videos={videos} sources={sources} journeys={journeys} contacts={contacts} tracking={tracking} />}
        {view === "journeys" && <JourneysView journeys={journeys} folders={folders} draftAssets={draftAssets} groups={smartGroups} videos={visibleVideos} shareUrl={shareUrl} onEdit={editJourney} onAdd={addToJourney} />}
        {isInternal && <JourneyTray draft={draft} assets={draftAssets} embedDraft={journeyEmbedDraft} working={journeyWorking} shareUrl={shareUrl} contacts={contacts} selectedJourneyId={selectedJourneyId} options={options} onDraftChange={setDraft} onEmbedDraftChange={setJourneyEmbedDraft} onAddEmbed={addEmbeddedAsset} onGenerate={generateJourney} onPublish={publishJourney} onMove={moveDraftAsset} onRemove={removeFromJourney} onCreateContactShare={createContactShare} />}
      </main>
    </div>
  );
}

