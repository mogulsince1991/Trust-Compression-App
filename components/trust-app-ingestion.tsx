"use client";

import { ArrowUpRight, BarChart3, ChevronDown, ChevronUp, Clapperboard, Eye, Import, Loader2, LogOut, Plus, Route, Save, Search, Share2, Trash2, Users, Wand2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type RoleId = "libraryManager" | "salesRep" | "owner" | "prospect";
type ViewId = "sources" | "library" | "prospects" | "journeys" | "metrics";
type MetricMode = "sales" | "social";

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
  metadata: Record<string, any> | null;
  tags: string[];
};

type SourceRow = {
  id: string;
  platform: string;
  account_label: string | null;
  status: string | null;
  last_synced_at: string | null;
  metadata: Record<string, any> | null;
};

type JourneyRow = {
  id: string;
  title: string;
  is_public: boolean | null;
  published_at: string | null;
  created_at: string | null;
};

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
  sources: SourceRow[];
  journeys: JourneyRow[];
  views: JourneyViewRow[];
};

type JourneyDraft = {
  title: string;
  heading: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
};

type SmartGroup = {
  key: string;
  title: string;
  videos: DbVideo[];
};

type VideoContext = {
  notes: string;
  targetBuyer: string;
  objections: string;
  offer: string;
  suggestedUse: string;
  salesCategory: string;
  funnelStage: string;
  tags: string;
};

const emptyDraft: JourneyDraft = {
  title: "",
  heading: "",
  description: "",
  ctaLabel: "Continue the conversation",
  ctaUrl: ""
};

const roles: Record<RoleId, { label: string; title: string; description: string; view: ViewId; placeholder: string }> = {
  libraryManager: {
    label: "Library Manager",
    title: "Connect the content sources.",
    description: "Import public channels, playlists, videos, and folders into a searchable proof library.",
    view: "sources",
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
  const [roleId, setRoleId] = useState<RoleId | null>(null);
  const [view, setView] = useState<ViewId>("sources");
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [videos, setVideos] = useState<DbVideo[]>([]);
  const [selected, setSelected] = useState<DbVideo | null>(null);
  const [metrics, setMetrics] = useState<MetricsState>({ sources: [], journeys: [], views: [] });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [draftVideos, setDraftVideos] = useState<DbVideo[]>([]);
  const [draft, setDraft] = useState<JourneyDraft>(emptyDraft);
  const [journeyWorking, setJourneyWorking] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const role = roleId ? roles[roleId] : null;
  const isInternal = roleId !== "prospect";

  const visibleVideos = videos.filter((video) => {
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
    return !query || haystack.includes(query.toLowerCase());
  });

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
        setSelected(null);
        setMetrics({ sources: [], journeys: [], views: [] });
      }
    });

    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session || !isInternal) return;

    let active = true;

    async function openWorkspace() {
      setLoading(true);
      setError("");
      const { data: id, error: workspaceError } = await supabase.rpc("ensure_workspace", {
        workspace_name: "Trust Library"
      });

      if (!active) return;
      if (workspaceError || !id) {
        setError(workspaceError?.message ?? "Could not open workspace.");
        setLoading(false);
        return;
      }

      setWorkspaceId(id);
      await loadVideos(id);
      await loadMetrics(id);
      if (active) setLoading(false);
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
      .select("id,title,source_platform,source_url,embed_url,thumbnail_url,duration_seconds,summary,suggested_use,proof_type,buying_stage,sales_category,funnel_stage,metadata,tags")
      .eq("workspace_id", nextWorkspaceId)
      .order("created_at", { ascending: false });

    if (loadError) {
      setError(loadError.message);
      return;
    }

    const nextVideos = (data ?? []) as DbVideo[];
    setVideos(nextVideos);
    setSelected((current) => (current ? nextVideos.find((video) => video.id === current.id) ?? nextVideos[0] ?? null : nextVideos[0] ?? null));
  }

  async function loadMetrics(nextWorkspaceId = workspaceId) {
    if (!supabase || !nextWorkspaceId) return;

    const [{ data: sources }, { data: journeys }] = await Promise.all([
      supabase.from("sources").select("id,platform,account_label,status,last_synced_at,metadata").eq("workspace_id", nextWorkspaceId).order("created_at", { ascending: false }),
      supabase.from("journeys").select("id,title,is_public,published_at,created_at").eq("workspace_id", nextWorkspaceId).order("created_at", { ascending: false })
    ]);

    const journeyRows = (journeys ?? []) as JourneyRow[];
    let views: JourneyViewRow[] = [];
    if (journeyRows.length) {
      const { data: viewRows } = await supabase
        .from("journey_views")
        .select("id,journey_id,video_id,event_type,viewer_label,metadata,created_at")
        .in("journey_id", journeyRows.map((journey) => journey.id))
        .order("created_at", { ascending: false });
      views = (viewRows ?? []) as JourneyViewRow[];
    }

    setMetrics({ sources: (sources ?? []) as SourceRow[], journeys: journeyRows, views });
  }

  async function importSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !session) return;

    const form = event.currentTarget;
    const sourceUrl = String(new FormData(form).get("sourceUrl") ?? "").trim();
    if (!sourceUrl) return;

    setWorking(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/sources/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ workspaceId, sourceUrl })
      });
      const result = (await response.json()) as { imported?: number; updated?: number; importMode?: string; error?: string };

      if (!response.ok) throw new Error(result.error ?? "Could not import that source.");

      form.reset();
      setNotice(`Imported ${result.imported ?? 0} new videos and updated ${result.updated ?? 0}. ${result.importMode === "youtube_rss" ? "RSS imported recent uploads." : ""}`);
      await loadVideos();
      await loadMetrics();
      setView("library");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not import that source.");
    } finally {
      setWorking(false);
    }
  }

  async function saveVideoContext(video: DbVideo, context: VideoContext) {
    if (!supabase) return;
    setWorking(true);
    setNotice("");
    setError("");

    const tags = Array.from(
      new Set([
        ...(video.tags ?? []),
        ...context.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      ])
    );
    const nextMetadata = {
      ...(video.metadata ?? {}),
      customContext: {
        notes: context.notes.trim(),
        targetBuyer: context.targetBuyer.trim(),
        objections: context.objections.trim(),
        offer: context.offer.trim(),
        updatedAt: new Date().toISOString()
      }
    };

    const payload = {
      suggested_use: context.suggestedUse.trim() || null,
      sales_category: context.salesCategory.trim() || video.sales_category,
      funnel_stage: context.funnelStage.trim() || video.funnel_stage,
      proof_type: context.salesCategory.trim() || video.proof_type,
      buying_stage: context.funnelStage.trim() || video.buying_stage,
      tags,
      metadata: nextMetadata,
      updated_at: new Date().toISOString()
    };

    const { error: saveError } = await supabase.from("videos").update(payload).eq("id", video.id);
    if (saveError) {
      setError(saveError.message);
      setWorking(false);
      return;
    }

    const updatedVideo = { ...video, ...payload } as DbVideo;
    setVideos((current) => current.map((item) => (item.id === video.id ? updatedVideo : item)));
    setSelected(updatedVideo);
    setNotice("Video context saved and searchable.");
    setWorking(false);
  }

  function addToJourney(video: DbVideo) {
    setDraftVideos((current) => {
      if (current.some((item) => item.id === video.id)) return current;
      const next = [...current, video];
      if (!draft.title && next.length === 1) {
        setDraft((currentDraft) => ({
          ...currentDraft,
          title: "Proof journey",
          heading: "A focused path through the videos that matter most.",
          description: "Watch these in order for a clearer view of the proof, questions, and next step."
        }));
      }
      return next;
    });
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

  async function generateJourney() {
    if (!draftVideos.length) return;
    setJourneyWorking(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/journeys/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videos: draftVideos,
          prompt: "Create a premium, minimal buyer-facing proof journey."
        })
      });
      const result = (await response.json()) as Partial<JourneyDraft> & { ctaLabel?: string; orderedTitles?: string[]; source?: string };
      if (!response.ok) throw new Error("Could not generate journey copy.");

      setDraft((current) => ({
        ...current,
        title: result.title || current.title,
        heading: result.heading || current.heading,
        description: result.description || current.description,
        ctaLabel: result.ctaLabel || current.ctaLabel
      }));

      if (Array.isArray(result.orderedTitles)) {
        setDraftVideos((current) =>
          [...current].sort((a, b) => {
            const aIndex = result.orderedTitles?.indexOf(a.title) ?? -1;
            const bIndex = result.orderedTitles?.indexOf(b.title) ?? -1;
            return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
          })
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
    if (!workspaceId || !session || !draftVideos.length) return;
    setJourneyWorking(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/journeys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          workspaceId,
          ...draft,
          videoIds: draftVideos.map((video) => video.id)
        })
      });
      const result = (await response.json()) as { shareUrl?: string; error?: string };
      if (!response.ok || !result.shareUrl) throw new Error(result.error ?? "Could not publish the journey.");

      const absoluteUrl = new URL(result.shareUrl, window.location.origin).toString();
      setShareUrl(absoluteUrl);
      setNotice("Journey published. The share link is ready.");
      await loadMetrics();
      setView("journeys");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not publish the journey.");
    } finally {
      setJourneyWorking(false);
    }
  }

  function chooseRole(nextRole: RoleId) {
    setRoleId(nextRole);
    setView(roles[nextRole].view);
    setNotice("");
    setError("");
  }

  if (!roleId || !role) return <RoleGate onChoose={chooseRole} />;

  if (loading) {
    return (
      <main className="role-gate">
        <Loader2 className="spin" />
        <h1>Opening workspace.</h1>
      </main>
    );
  }

  if (!supabase && isInternal) {
    return <SimpleGate title="Supabase is not configured." body="Add the Supabase public URL and publishable key in Vercel." onBack={() => setRoleId(null)} />;
  }

  if (!session && isInternal) {
    return <AuthGate role={role} supabase={supabase} onBack={() => setRoleId(null)} />;
  }

  return (
    <div className="app">
      <aside className="side" aria-label="Workspace">
        <button className="mark" onClick={() => setRoleId(null)} aria-label="Switch role">
          T
        </button>
        <nav className="side-nav">
          <button className={view === "sources" ? "icon-button is-active" : "icon-button"} onClick={() => setView("sources")} aria-label="Sources">
            <Import />
          </button>
          <button className={view === "library" ? "icon-button is-active" : "icon-button"} onClick={() => setView("library")} aria-label="Library">
            <Clapperboard />
          </button>
          <button className={view === "prospects" ? "icon-button is-active" : "icon-button"} onClick={() => setView("prospects")} aria-label="Prospects">
            <Users />
          </button>
          <button className={view === "metrics" ? "icon-button is-active" : "icon-button"} onClick={() => setView("metrics")} aria-label="Sales metrics">
            <BarChart3 />
          </button>
          <button className={view === "journeys" ? "icon-button is-active" : "icon-button"} onClick={() => setView("journeys")} aria-label="Journeys">
            <Route />
          </button>
        </nav>
        {session && (
          <button className="icon-button" onClick={() => supabase?.auth.signOut()} aria-label="Sign out">
            <LogOut />
          </button>
        )}
      </aside>

      <main className="stage">
        <header className="command-bar">
          <div className="brand-line">
            <span>{role.label}</span>
            <strong>Trust Library</strong>
          </div>
          <label className="command-search">
            <Search />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={role.placeholder} />
          </label>
          <button className="connect-button" onClick={() => setRoleId(null)}>
            <Eye />
            Switch
          </button>
        </header>

        <section className="role-context is-quiet">
          <span>{role.label}</span>
          <h2>{role.title}</h2>
          <p>{role.description}</p>
        </section>

        {(notice || error) && <p style={{ margin: "0 6px 18px", color: error ? "#ffd4d4" : "#d8d1c5" }}>{error || notice}</p>}

        {view === "sources" && <SourcesView importing={working} onImport={importSource} />}
        {view === "library" && <LibraryConfigurator videos={visibleVideos} selected={selected} saving={working} onSelect={setSelected} onAdd={addToJourney} onSaveContext={saveVideoContext} />}
        {view === "prospects" && <SequenceView title="Recommended proof" groups={smartGroups} videos={visibleVideos.slice(0, 6)} onAdd={addToJourney} />}
        {view === "metrics" && <MetricsView metrics={metrics} videos={videos} />}
        {view === "journeys" && <SequenceView title="Journey draft" groups={smartGroups} videos={draftVideos.length ? draftVideos : visibleVideos.slice(0, 6)} onAdd={addToJourney} shareUrl={shareUrl} />}
      </main>
      {isInternal && (
        <JourneyTray
          draft={draft}
          videos={draftVideos}
          working={journeyWorking}
          shareUrl={shareUrl}
          onDraftChange={setDraft}
          onGenerate={generateJourney}
          onPublish={publishJourney}
          onMove={moveDraftVideo}
          onRemove={removeFromJourney}
        />
      )}
    </div>
  );
}

function RoleGate({ onChoose }: { onChoose: (role: RoleId) => void }) {
  return (
    <main className="role-gate">
      <section className="gate-intro">
        <span>Trust Library</span>
        <h1>Choose your workspace.</h1>
        <p>Start with sources, then turn imported videos into proof journeys.</p>
      </section>
      <section className="role-grid">
        {(Object.keys(roles) as RoleId[]).map((id) => (
          <button className="role-card" key={id} onClick={() => onChoose(id)}>
            <span>{roles[id].label}</span>
            <h2>{roles[id].title}</h2>
            <p>{roles[id].description}</p>
            <i>
              Open <ArrowUpRight />
            </i>
          </button>
        ))}
      </section>
    </main>
  );
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

  return (
    <main className="role-gate">
      <button className="text-button" onClick={onBack}>
        Back
      </button>
      <section className="gate-intro">
        <span>{role.label}</span>
        <h1>Sign in.</h1>
        <p>{role.description}</p>
      </section>
      <form className="prospect-brief" onSubmit={sendMagicLink}>
        <div className="brief-grid">
          <label className="wide-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required />
          </label>
          <label className="wide-field">
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password login" minLength={6} />
          </label>
        </div>
        <button className="wide-action" disabled={sending}>
          {sending ? <Loader2 className="spin" /> : <ArrowUpRight />}
          Send magic link
        </button>
        <button className="text-button" type="button" disabled={sending || !email || password.length < 6} onClick={signInWithPassword} style={{ marginTop: 12 }}>
          Sign in with password
        </button>
        {message && <p style={{ border: "1px solid rgba(255,255,255,.16)", color: isError ? "#ffd4d4" : "#e9e2d6", marginTop: 16, padding: "14px 16px" }}>{message}</p>}
      </form>
    </main>
  );
}

function SourcesView({ importing, onImport }: { importing: boolean; onImport: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <section className="library-shell">
      <section className="browse">
        <div className="collection-top">
          <div>
            <span>Sources</span>
            <h1>Import public video sources</h1>
          </div>
          <p>Public channels import recent uploads without a key. A YouTube API key unlocks deeper playlist and channel imports.</p>
        </div>
        <form className="prospect-brief" onSubmit={onImport}>
          <div className="brief-grid">
            <label className="wide-field">
              <span>Public source URL</span>
              <input name="sourceUrl" required placeholder="https://youtu.be/... or https://www.youtube.com/@channel" />
            </label>
          </div>
          <button className="wide-action" disabled={importing}>
            {importing ? <Loader2 className="spin" /> : <Import />}
            Import source
          </button>
        </form>
      </section>
      <aside className="focus-panel" style={{ padding: 18 }}>
        <span>Connector roadmap</span>
        <h2>Public channels first. Owned accounts next.</h2>
        <p>YouTube videos write into Supabase with sales categories and funnel stages. Google-owned YouTube, Drive, Instagram, and Facebook will plug into the same source model.</p>
      </aside>
    </section>
  );
}

function LibraryConfigurator({ videos, selected, saving, onSelect, onAdd, onSaveContext }: { videos: DbVideo[]; selected: DbVideo | null; saving: boolean; onSelect: (video: DbVideo) => void; onAdd: (video: DbVideo) => void; onSaveContext: (video: DbVideo, context: VideoContext) => void }) {
  const stripVideos = videos.length > 5 ? [...videos, ...videos] : videos;

  if (!videos.length) {
    return (
      <section className="prospect-brief">
        <span>No videos yet</span>
        <h2>Start by importing a public source.</h2>
        <p>Paste a YouTube video first, then channels, playlists, Drive, and social accounts can build on the same library.</p>
      </section>
    );
  }

  return (
    <section className="library-configurator">
      <div className="config-topline">
        <span>{videos.length} videos</span>
        <p>Scroll sideways, select a video, then add searchable context or send it to a journey.</p>
      </div>

      <section className="library-strip" aria-label="Video library selector">
        {stripVideos.map((video, index) => (
          <button className={selected?.id === video.id ? "strip-card is-selected" : "strip-card"} key={`${video.id}-${index}`} onClick={() => onSelect(video)}>
            <span className="strip-thumb" style={{ backgroundImage: `url(${video.thumbnail_url ?? ""})` }} />
            <strong>{video.title}</strong>
            <small>{video.sales_category ?? video.source_platform} / {formatDuration(video.duration_seconds)}</small>
          </button>
        ))}
      </section>

      <BottomPlayer selected={selected} saving={saving} onAdd={onAdd} onSaveContext={onSaveContext} />
    </section>
  );
}

function BottomPlayer({ selected, saving, onAdd, onSaveContext }: { selected: DbVideo | null; saving: boolean; onAdd: (video: DbVideo) => void; onSaveContext: (video: DbVideo, context: VideoContext) => void }) {
  if (!selected) return null;

  return (
    <section className="library-player-dock">
      <div className="bottom-video">
        {selected.embed_url ? (
          <iframe src={selected.embed_url} title={selected.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
        ) : (
          <div style={{ backgroundImage: `url(${selected.thumbnail_url ?? ""})` }} />
        )}
      </div>
      <section className="bottom-context">
        <div className="mini-head">
          <span>{selected.source_platform}</span>
          <button className="text-button compact" onClick={() => onAdd(selected)}>
            <Plus />
            Journey
          </button>
        </div>
        <h2>{selected.title}</h2>
        <ContextEditor key={selected.id} video={selected} saving={saving} onSave={onSaveContext} />
      </section>
    </section>
  );
}

function ContextEditor({ video, saving, onSave }: { video: DbVideo; saving: boolean; onSave: (video: DbVideo, context: VideoContext) => void }) {
  const context = video.metadata?.customContext ?? {};
  const [form, setForm] = useState<VideoContext>({
    notes: context.notes ?? "",
    targetBuyer: context.targetBuyer ?? "",
    objections: context.objections ?? "",
    offer: context.offer ?? "",
    suggestedUse: video.suggested_use ?? "",
    salesCategory: video.sales_category ?? video.proof_type ?? "Education",
    funnelStage: video.funnel_stage ?? video.buying_stage ?? "consideration",
    tags: (video.tags ?? []).join(", ")
  });

  return (
    <form
      className="context-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(video, form);
      }}
    >
      <label className="wide-field">
        <span>Search context</span>
        <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="What this video proves, when to use it, and what a rep should search to find it." />
      </label>
      <div className="brief-grid compact-grid">
        <label>
          <span>Buyer</span>
          <input value={form.targetBuyer} onChange={(event) => setForm({ ...form, targetBuyer: event.target.value })} placeholder="Homeowner, founder, CFO..." />
        </label>
        <label>
          <span>Objections</span>
          <input value={form.objections} onChange={(event) => setForm({ ...form, objections: event.target.value })} placeholder="Price, trust, timing..." />
        </label>
        <label>
          <span>Offer</span>
          <input value={form.offer} onChange={(event) => setForm({ ...form, offer: event.target.value })} placeholder="Service, product, package..." />
        </label>
        <label>
          <span>Use case</span>
          <input value={form.suggestedUse} onChange={(event) => setForm({ ...form, suggestedUse: event.target.value })} placeholder="Send before pricing call" />
        </label>
        <label>
          <span>Sales category</span>
          <input value={form.salesCategory} onChange={(event) => setForm({ ...form, salesCategory: event.target.value })} placeholder="Testimonial" />
        </label>
        <label>
          <span>Funnel stage</span>
          <input value={form.funnelStage} onChange={(event) => setForm({ ...form, funnelStage: event.target.value })} placeholder="decision" />
        </label>
      </div>
      <label className="wide-field">
        <span>Tags</span>
        <input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="comma, separated, tags" />
      </label>
      <button className="wide-action" disabled={saving}>
        {saving ? <Loader2 className="spin" /> : <Save />}
        Save context
      </button>
    </form>
  );
}

function MetricsView({ metrics, videos }: { metrics: MetricsState; videos: DbVideo[] }) {
  const [mode, setMode] = useState<MetricMode>("sales");
  const watchEvents = metrics.views.filter((event) => event.event_type === "video_active" || event.event_type === "video_started");
  const viewers = new Set(metrics.views.map((event) => event.viewer_label || event.metadata?.viewerId).filter(Boolean));
  const sourceModes = metrics.sources.reduce<Record<string, number>>((counts, source) => {
    const modeLabel = String(source.metadata?.importMode ?? "connected");
    counts[modeLabel] = (counts[modeLabel] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <section className="metrics-board">
      <div className="metric-tabs">
        <button className={mode === "sales" ? "is-active" : ""} onClick={() => setMode("sales")}>Sales metrics</button>
        <button className={mode === "social" ? "is-active" : ""} onClick={() => setMode("social")}>Social metrics</button>
      </div>

      {mode === "sales" ? (
        <div className="metric-grid">
          <MetricCard label="Journey views" value={String(watchEvents.length)} detail="Tracked when someone opens and watches a shared proof journey." />
          <MetricCard label="Known viewers" value={String(viewers.size)} detail="Anonymous visitor sessions for now; named prospects can attach later." />
          <MetricCard label="Published journeys" value={String(metrics.journeys.filter((journey) => journey.is_public).length)} detail="Shareable trust paths your team has created." />
          <MetricCard label="Library videos" value={String(videos.length)} detail="Imported videos available for sales journeys." />
        </div>
      ) : (
        <div className="metric-grid">
          <MetricCard label="Connected sources" value={String(metrics.sources.length)} detail="Public channels and accounts added to this workspace." />
          <MetricCard label="Imported videos" value={String(videos.length)} detail="Videos imported from public or connected source libraries." />
          <MetricCard label="RSS sources" value={String(sourceModes.youtube_rss ?? 0)} detail="Recent public uploads pulled without a YouTube API key." />
          <MetricCard label="API sources" value={String(sourceModes.youtube_api ?? 0)} detail="Richer imports from configured YouTube API access." />
        </div>
      )}

      <section className="metrics-note">
        <span>{mode === "sales" ? "Buyer intent" : "Source performance"}</span>
        <h2>{mode === "sales" ? "This should become the owner's trust pipeline view." : "Public stats come first, private stats come with OAuth."}</h2>
        <p>
          {mode === "sales"
            ? "The most useful next layer is per-journey retention: which video was watched, where viewers dropped, and which proof sequences led to replies or booked calls."
            : "For public YouTube channels we can store public counts when the API key is present. For private YouTube, Instagram, and Facebook analytics, each platform needs OAuth permissions from the account owner."}
        </p>
      </section>
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function SequenceView({ title, videos, groups, onAdd, shareUrl }: { title: string; videos: DbVideo[]; groups: SmartGroup[]; onAdd: (video: DbVideo) => void; shareUrl?: string }) {
  return (
    <section className="recommendation-board">
      <div className="mini-head">
        <span>{title}</span>
        {shareUrl && (
          <a className="text-link" href={shareUrl} target="_blank" rel="noreferrer">
            Open share link
          </a>
        )}
      </div>
      {groups.length > 0 && <SmartGroups groups={groups.slice(0, 3)} onSelect={() => undefined} onAdd={onAdd} compact />}
      <div>
        {videos.map((video, index) => (
          <div className="sequence-item" key={video.id}>
            <span>{index + 1}</span>
            <div>
              <strong>{video.title}</strong>
              <small>{video.sales_category ?? video.source_platform} / {formatDuration(video.duration_seconds)}</small>
            </div>
            <button className="icon-mini" onClick={() => onAdd(video)} aria-label={`Add ${video.title} to journey`}>
              <Plus />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function SmartGroups({ groups, onSelect, onAdd, compact = false }: { groups: SmartGroup[]; onSelect: (video: DbVideo) => void; onAdd: (video: DbVideo) => void; compact?: boolean }) {
  return (
    <section className={compact ? "smart-groups is-compact" : "smart-groups"}>
      {groups.map((group) => (
        <article className="smart-group" key={group.key}>
          <div>
            <span>Recommended path</span>
            <h3>{group.title}</h3>
          </div>
          <div className="smart-strip">
            {group.videos.slice(0, 4).map((video) => (
              <button className="smart-video" key={video.id} onClick={() => onSelect(video)}>
                <span style={{ backgroundImage: `url(${video.thumbnail_url ?? ""})` }} />
                <strong>{video.title}</strong>
                <small>{video.funnel_stage ?? video.buying_stage ?? "Library"}</small>
                <i
                  onClick={(event) => {
                    event.stopPropagation();
                    onAdd(video);
                  }}
                >
                  <Plus />
                </i>
              </button>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function JourneyTray({ draft, videos, working, shareUrl, onDraftChange, onGenerate, onPublish, onMove, onRemove }: { draft: JourneyDraft; videos: DbVideo[]; working: boolean; shareUrl: string; onDraftChange: (draft: JourneyDraft) => void; onGenerate: () => void; onPublish: () => void; onMove: (videoId: string, direction: -1 | 1) => void; onRemove: (videoId: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <aside className={open ? "journey-tray is-open" : "journey-tray"}>
      <button className="tray-tab" onClick={() => setOpen((current) => !current)}>
        <Route />
        <span>{videos.length} in journey</span>
      </button>
      <div className="tray-body">
        <div className="mini-head">
          <span>Draft journey</span>
          <button className="icon-mini" onClick={() => setOpen(false)} aria-label="Close journey tray">
            <ChevronDown />
          </button>
        </div>
        <label>
          <span>Title</span>
          <input value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} placeholder="Proof journey" />
        </label>
        <label>
          <span>Heading</span>
          <input value={draft.heading} onChange={(event) => onDraftChange({ ...draft, heading: event.target.value })} placeholder="A focused proof path." />
        </label>
        <label>
          <span>Description</span>
          <textarea value={draft.description} onChange={(event) => onDraftChange({ ...draft, description: event.target.value })} placeholder="What this journey helps the viewer understand." />
        </label>
        <div className="brief-grid">
          <label>
            <span>CTA</span>
            <input value={draft.ctaLabel} onChange={(event) => onDraftChange({ ...draft, ctaLabel: event.target.value })} />
          </label>
          <label>
            <span>CTA URL</span>
            <input value={draft.ctaUrl} onChange={(event) => onDraftChange({ ...draft, ctaUrl: event.target.value })} placeholder="https://..." />
          </label>
        </div>
        <div className="tray-list">
          {videos.map((video, index) => (
            <article className="tray-item" key={video.id}>
              <span>{index + 1}</span>
              <strong>{video.title}</strong>
              <button className="icon-mini" disabled={index === 0} onClick={() => onMove(video.id, -1)} aria-label="Move up">
                <ChevronUp />
              </button>
              <button className="icon-mini" disabled={index === videos.length - 1} onClick={() => onMove(video.id, 1)} aria-label="Move down">
                <ChevronDown />
              </button>
              <button className="icon-mini" onClick={() => onRemove(video.id)} aria-label="Remove video">
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
        <div className="tray-actions">
          <button className="seed-button" disabled={working || !videos.length} onClick={onGenerate}>
            {working ? <Loader2 className="spin" /> : <Wand2 />}
            Generate
          </button>
          <button className="wide-action" disabled={working || !videos.length} onClick={onPublish}>
            {working ? <Loader2 className="spin" /> : <Share2 />}
            Publish
          </button>
        </div>
        {shareUrl && (
          <a className="share-link" href={shareUrl} target="_blank" rel="noreferrer">
            {shareUrl}
          </a>
        )}
      </div>
    </aside>
  );
}

function SimpleGate({ title, body, onBack }: { title: string; body: string; onBack: () => void }) {
  return (
    <main className="role-gate">
      <button className="text-button" onClick={onBack}>
        Back
      </button>
      <section className="gate-intro">
        <span>Setup</span>
        <h1>{title}</h1>
        <p>{body}</p>
      </section>
    </main>
  );
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "--";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function buildSmartGroups(videos: DbVideo[]): SmartGroup[] {
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
    .map(([key, groupVideos]) => ({
      key,
      title: titleMap[key] ?? key,
      videos: groupVideos
    }))
    .sort((a, b) => b.videos.length - a.videos.length)
    .slice(0, 6);
}
