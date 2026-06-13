"use client";

import { ArrowUpRight, ChevronDown, ChevronUp, Clapperboard, Eye, Import, Loader2, LogOut, Plus, Route, Search, Share2, Trash2, Users, Wand2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type RoleId = "libraryManager" | "salesRep" | "owner" | "prospect";
type ViewId = "sources" | "library" | "prospects" | "journeys";

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
  metadata: Record<string, unknown> | null;
  tags: string[];
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
    placeholder: "Search imported videos, transcripts, tags..."
  },
  salesRep: {
    label: "Sales Rep",
    title: "Find proof for this buyer.",
    description: "Search the saved library and assemble the right proof sequence for a prospect.",
    view: "library",
    placeholder: "Search by objection, service, concern..."
  },
  owner: {
    label: "Owner",
    title: "See the company's usable proof.",
    description: "Review which imported videos your team can actually use.",
    view: "library",
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
    const haystack = [video.title, video.source_platform, video.summary, video.suggested_use, video.proof_type, video.buying_stage, video.sales_category, video.funnel_stage, ...video.tags]
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
    setSelected(nextVideos[0] ?? null);
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
      const result = (await response.json()) as { imported?: number; updated?: number; error?: string };

      if (!response.ok) throw new Error(result.error ?? "Could not import that source.");

      form.reset();
      setNotice(`Imported ${result.imported ?? 0} new videos and updated ${result.updated ?? 0}.`);
      await loadVideos();
      setView("library");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not import that source.");
    } finally {
      setWorking(false);
    }
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
        {view === "library" && <LibraryView videos={visibleVideos} selected={selected} groups={smartGroups} onSelect={setSelected} onAdd={addToJourney} />}
        {view === "prospects" && <SequenceView title="Recommended proof" groups={smartGroups} videos={visibleVideos.slice(0, 6)} onAdd={addToJourney} />}
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
          <p>Paste a video, playlist, or public channel. Channel imports use the YouTube API key in Vercel.</p>
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

function LibraryView({ videos, selected, groups, onSelect, onAdd }: { videos: DbVideo[]; selected: DbVideo | null; groups: SmartGroup[]; onSelect: (video: DbVideo) => void; onAdd: (video: DbVideo) => void }) {
  return (
    <section className="library-shell">
      <section className="browse">
        <div className="collection-top">
          <div>
            <span>Library</span>
            <h1>Imported videos</h1>
          </div>
          <p>{videos.length} videos</p>
        </div>
        {groups.length > 0 && <SmartGroups groups={groups} onSelect={onSelect} onAdd={onAdd} />}
        {videos.length ? (
          <div className="media-wall">
            {videos.map((video) => (
              <button className={selected?.id === video.id ? "media-card is-selected" : "media-card"} key={video.id} onClick={() => onSelect(video)}>
                <div className="thumb" style={{ backgroundImage: `url(${video.thumbnail_url ?? ""})` }} />
                <div className="card-copy">
                  <div className="meta-line">
                    <span>{video.sales_category ?? video.proof_type ?? video.source_platform}</span>
                    <span>{formatDuration(video.duration_seconds)}</span>
                  </div>
                  <h3>{video.title}</h3>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <section className="prospect-brief">
            <span>No videos yet</span>
            <h2>Start by importing a public source.</h2>
            <p>Paste a YouTube video first, then channels, playlists, Drive, and social accounts can build on the same library.</p>
          </section>
        )}
      </section>
      <Inspector selected={selected} onAdd={onAdd} />
    </section>
  );
}

function Inspector({ selected, onAdd }: { selected: DbVideo | null; onAdd: (video: DbVideo) => void }) {
  if (!selected) {
    return (
      <aside className="focus-panel" style={{ padding: 18 }}>
        <span>Selected</span>
        <h2>No video selected.</h2>
        <p>Imported videos will show their embedded player, metadata, and AI notes here.</p>
      </aside>
    );
  }

  return (
    <aside className="focus-panel">
      <div className="panel-top">
        <span>{selected.source_platform}</span>
        <button className="text-button compact" onClick={() => onAdd(selected)}>
          <Plus />
          Journey
        </button>
      </div>
      {selected.embed_url ? (
        <iframe className="preview-frame" src={selected.embed_url} title={selected.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
      ) : (
        <div className="preview-frame" style={{ backgroundImage: `url(${selected.thumbnail_url ?? ""})` }} />
      )}
      <div className="focus-copy">
        <div className="meta-line">
          <span>{selected.sales_category ?? selected.proof_type ?? "Imported"} / {selected.funnel_stage ?? selected.buying_stage ?? "Library"}</span>
          {selected.source_url && (
            <a href={selected.source_url} target="_blank" rel="noreferrer">
              Source
            </a>
          )}
        </div>
        <h2>{selected.title}</h2>
        <p>{selected.summary ?? "Transcript and AI summary will be added in the processing layer."}</p>
      </div>
      <div className="trust-tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
    </aside>
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
