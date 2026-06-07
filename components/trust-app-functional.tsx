"use client";

import { ArrowUpRight, Clapperboard, Eye, Loader2, LogOut, Play, Plus, Route, Search, Sparkles, Users } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { videos as demoVideos, type Video } from "@/lib/mock-data";

type RoleId = "libraryManager" | "salesRep" | "owner" | "prospect";
type ViewId = "library" | "prospects" | "journeys";

type DbVideo = {
  id: string;
  title: string;
  source_platform: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  summary: string | null;
  suggested_use: string | null;
  proof_type: string | null;
  tags: string[];
};

const roles: Record<RoleId, { label: string; title: string; description: string; view: ViewId; placeholder: string }> = {
  libraryManager: {
    label: "Library Manager",
    title: "Build the proof library.",
    description: "Save videos, transcripts, summaries, tags, and recommended sales use cases.",
    view: "library",
    placeholder: "Search videos, transcripts, tags..."
  },
  salesRep: {
    label: "Sales Rep",
    title: "Find proof for this buyer.",
    description: "Search the saved library and assemble the right proof sequence for a prospect.",
    view: "prospects",
    placeholder: "Search by objection, service, concern..."
  },
  owner: {
    label: "Owner",
    title: "See the company's usable proof.",
    description: "Review the database-backed library your team can pull from.",
    view: "library",
    placeholder: "Search proof, gaps, objections..."
  },
  prospect: {
    label: "Prospect",
    title: "View a quiet trust journey.",
    description: "A clean buyer-facing sequence. Public journey persistence comes next.",
    view: "journeys",
    placeholder: "Search within this journey..."
  }
};

const filters = ["All", "Testimonials", "Pricing", "Process", "Objections", "Founder"];

export function TrustAppFunctional() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [roleId, setRoleId] = useState<RoleId | null>(null);
  const [view, setView] = useState<ViewId>("library");
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [selected, setSelected] = useState<Video | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const role = roleId ? roles[roleId] : null;
  const isInternal = roleId !== "prospect";

  const visibleVideos = useMemo(() => {
    return videos.filter((video) => {
      const matchesFilter =
        filter === "All" ||
        video.type === filter ||
        (filter === "Testimonials" && video.type === "Testimonial") ||
        (filter === "Objections" && video.tags.includes("Objection"));
      const haystack = [video.title, video.source, video.type, video.summary, video.use, ...video.tags].join(" ").toLowerCase();
      return matchesFilter && (!query || haystack.includes(query.toLowerCase()));
    });
  }, [filter, query, videos]);

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

    const client = supabase;
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      const { data: id, error: workspaceError } = await client.rpc("ensure_workspace", {
        workspace_name: "Acme Remodel"
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

    void load();

    return () => {
      active = false;
    };
  }, [isInternal, session, supabase]);

  async function loadVideos(nextWorkspaceId = workspaceId) {
    if (!supabase || !nextWorkspaceId) return;

    const { data, error: loadError } = await supabase
      .from("videos")
      .select("id,title,source_platform,thumbnail_url,duration_seconds,transcript,summary,suggested_use,proof_type,tags")
      .eq("workspace_id", nextWorkspaceId)
      .order("created_at", { ascending: false });

    if (loadError) {
      setError(loadError.message);
      return;
    }

    const mapped = (data as DbVideo[]).map(mapDbVideo);
    setVideos(mapped);
    setSelected((current) => current ?? mapped[0] ?? null);
  }

  function chooseRole(nextRole: RoleId) {
    setRoleId(nextRole);
    setView(roles[nextRole].view);
    setNotice("");
    setError("");
  }

  async function addVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !workspaceId || !session) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return;

    setSaving(true);
    setError("");

    const { error: insertError } = await supabase.from("videos").insert({
      workspace_id: workspaceId,
      title,
      source_platform: String(formData.get("source_platform") ?? "manual").trim() || "manual",
      thumbnail_url: emptyToNull(formData.get("thumbnail_url")),
      summary: emptyToNull(formData.get("summary")),
      suggested_use: emptyToNull(formData.get("suggested_use")),
      proof_type: emptyToNull(formData.get("proof_type")),
      transcript: emptyToNull(formData.get("transcript")),
      tags: String(formData.get("tags") ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      created_by: session.user.id
    });

    if (insertError) {
      setError(insertError.message);
    } else {
      form.reset();
      setNotice("Video saved to Supabase.");
      await loadVideos();
    }

    setSaving(false);
  }

  async function seedDemoLibrary() {
    if (!supabase || !workspaceId || !session) return;

    setSaving(true);
    setError("");

    const { error: seedError } = await supabase.from("videos").insert(
      demoVideos.map((video) => ({
        workspace_id: workspaceId,
        title: video.title,
        source_platform: video.source,
        thumbnail_url: video.image,
        duration_seconds: parseDuration(video.duration),
        summary: video.summary,
        suggested_use: video.use,
        proof_type: video.type,
        tags: video.tags,
        created_by: session.user.id
      }))
    );

    if (seedError) {
      setError(seedError.message);
    } else {
      setNotice("Demo videos saved to Supabase.");
      await loadVideos();
    }

    setSaving(false);
  }

  if (!roleId || !role) {
    return <RoleGate onChoose={chooseRole} />;
  }

  if (loading) {
    return (
      <main className="role-gate">
        <Loader2 className="spin" />
        <h1>Opening workspace.</h1>
      </main>
    );
  }

  if (!supabase && isInternal) {
    return <SimpleGate title="Supabase is not configured." body="Add the public Supabase URL and publishable key in Vercel, then redeploy." onBack={() => setRoleId(null)} />;
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
            <strong>Acme Remodel</strong>
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

        {view === "library" && (
          <section className="library-shell">
            <section className="browse">
              <div className="collection-top">
                <div>
                  <span>Library</span>
                  <h1>Saved videos</h1>
                </div>
                <p>{videos.length} rows in Supabase</p>
              </div>

              {isInternal && <VideoForm disabled={saving || !workspaceId} hasVideos={videos.length > 0} onSubmit={addVideo} onSeed={seedDemoLibrary} />}

              <div className="context-row">
                {filters.map((item) => (
                  <button className={filter === item ? "pill is-active" : "pill"} key={item} onClick={() => setFilter(item)}>
                    {item}
                  </button>
                ))}
              </div>

              {visibleVideos.length ? <MediaWall videos={visibleVideos} selected={selected} onSelect={setSelected} /> : <EmptyLibrary disabled={saving || !workspaceId} onSeed={seedDemoLibrary} />}
            </section>
            <Inspector selected={selected} />
          </section>
        )}

        {view === "prospects" && <ProspectWorkspace videos={videos} />}
        {view === "journeys" && <JourneyPreview videos={videos.length ? videos : demoVideos} />}
      </main>
    </div>
  );
}

function RoleGate({ onChoose }: { onChoose: (role: RoleId) => void }) {
  return (
    <main className="role-gate">
      <section className="gate-intro">
        <span>Trust Library</span>
        <h1>Choose your workspace.</h1>
        <p>Pick the role first, then the app opens into that person's context.</p>
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
    setSending(true);
    setIsError(false);
    setMessage("Sending sign-in link...");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setIsError(Boolean(error));
    setMessage(error ? friendlyAuthError(error.message) : "Check your email. The sign-in link has been sent.");
    setSending(false);
  }

  async function signInWithPassword() {
    if (!supabase || !email || !password) return;
    setSending(true);
    setIsError(false);
    setMessage("Signing in...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsError(Boolean(error));
    setMessage(error ? friendlyAuthError(error.message) : "Signed in. Opening your workspace...");
    setSending(false);
  }

  async function createAccount() {
    if (!supabase || !email || !password) return;
    setSending(true);
    setIsError(false);
    setMessage("Creating account...");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin }
    });
    setIsError(Boolean(error));
    setMessage(error ? friendlyAuthError(error.message) : "Account created. If Supabase asks for confirmation, check your email; otherwise the workspace will open now.");
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
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Optional for password login" minLength={6} />
          </label>
        </div>
        <button className="wide-action" disabled={sending}>
          {sending ? <Loader2 className="spin" /> : <ArrowUpRight />}
          Send magic link
        </button>
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <button className="text-button" type="button" disabled={sending || !email || password.length < 6} onClick={signInWithPassword}>
            Sign in with password
          </button>
          <button className="text-button" type="button" disabled={sending || !email || password.length < 6} onClick={createAccount}>
            Create password account
          </button>
        </div>
        {message && (
          <p
            style={{
              border: "1px solid rgba(255,255,255,.16)",
              color: isError ? "#ffd4d4" : "#e9e2d6",
              marginTop: 16,
              padding: "14px 16px"
            }}
          >
            {message}
          </p>
        )}
      </form>
    </main>
  );
}

function friendlyAuthError(message: string) {
  if (message.toLowerCase().includes("rate limit")) {
    return "Supabase is rate-limiting magic-link emails right now. Wait a few minutes, or use the password option below for testing.";
  }

  return message;
}

function VideoForm({ disabled, hasVideos, onSubmit, onSeed }: { disabled: boolean; hasVideos: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onSeed: () => void }) {
  return (
    <form className="prospect-brief" onSubmit={onSubmit} style={{ marginBottom: 16 }}>
      <div className="brief-grid">
        <label>
          <span>Title</span>
          <input name="title" required placeholder="Pricing explainer" />
        </label>
        <label>
          <span>Source</span>
          <input name="source_platform" placeholder="Instagram Reel" />
        </label>
        <label>
          <span>Thumbnail</span>
          <input name="thumbnail_url" placeholder="https://..." />
        </label>
        <label>
          <span>Type</span>
          <input name="proof_type" placeholder="Pricing, Process, Testimonial" />
        </label>
        <label className="wide-field">
          <span>Summary</span>
          <textarea name="summary" placeholder="What does this video prove?" />
        </label>
        <label className="wide-field">
          <span>Recommended use</span>
          <textarea name="suggested_use" placeholder="When should a rep send this?" />
        </label>
        <label className="wide-field">
          <span>Transcript</span>
          <textarea name="transcript" placeholder="Paste transcript or caption..." />
        </label>
        <label className="wide-field">
          <span>Tags</span>
          <input name="tags" placeholder="Pricing, Objection, Kitchen" />
        </label>
      </div>
      <button className="wide-action" disabled={disabled}>
        <Plus />
        Save video
      </button>
      {!hasVideos && (
        <button className="text-button" type="button" disabled={disabled} onClick={onSeed} style={{ marginTop: 12 }}>
          <Sparkles />
          Seed demo library
        </button>
      )}
    </form>
  );
}

function MediaWall({ videos, selected, onSelect }: { videos: Video[]; selected: Video | null; onSelect: (video: Video) => void }) {
  return (
    <div className="media-wall">
      {videos.map((video) => (
        <button className={selected?.id === video.id ? "media-card is-selected" : "media-card"} key={video.id} onClick={() => onSelect(video)}>
          <div className="thumb" style={{ backgroundImage: `url(${video.image})` }} />
          <div className="card-copy">
            <div className="meta-line">
              <span>{video.type}</span>
              <span>{video.duration}</span>
            </div>
            <h3>{video.title}</h3>
          </div>
        </button>
      ))}
    </div>
  );
}

function EmptyLibrary({ disabled, onSeed }: { disabled: boolean; onSeed: () => void }) {
  return (
    <section className="prospect-brief">
      <span>No videos yet</span>
      <h2>Start by saving proof to the database.</h2>
      <p>Add a real video above, or seed the demo library to test the app with Supabase rows.</p>
      <button className="wide-action" disabled={disabled} onClick={onSeed}>
        <Sparkles />
        Seed demo library
      </button>
    </section>
  );
}

function Inspector({ selected }: { selected: Video | null }) {
  if (!selected) {
    return (
      <aside className="focus-panel" style={{ padding: 18 }}>
        <span>Selected</span>
        <h2>No video selected.</h2>
        <p>Saved videos will show their summary, tags, and recommended use here.</p>
      </aside>
    );
  }

  return (
    <aside className="focus-panel">
      <div className="panel-top">
        <span>Selected</span>
      </div>
      <div className="preview-frame" style={{ backgroundImage: `url(${selected.image})` }}>
        <button className="play-button" aria-label={`Play ${selected.title}`}>
          <Play />
        </button>
      </div>
      <div className="focus-copy">
        <div className="meta-line">
          <span>{selected.source}</span>
          <span>{selected.duration}</span>
        </div>
        <h2>{selected.title}</h2>
        <p>{selected.summary}</p>
      </div>
      <div className="trust-tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      <div className="ai-note">
        <span>Recommended use</span>
        <p>{selected.use}</p>
      </div>
    </aside>
  );
}

function ProspectWorkspace({ videos }: { videos: Video[] }) {
  const recommended = videos.length ? videos.slice(0, 6) : demoVideos.slice(0, 3);
  return (
    <section className="recommendation-board">
      <div className="mini-head">
        <span>Recommended from library</span>
        <button className="text-button">
          Create journey <ArrowUpRight />
        </button>
      </div>
      <Sequence videos={recommended} />
    </section>
  );
}

function JourneyPreview({ videos }: { videos: Video[] }) {
  return (
    <section className="journey-board">
      <section className="share-preview">
        <div className="cover-strip">{videos.slice(0, 3).map((video) => <div className="cover-tile" key={video.id} style={{ backgroundImage: `url(${video.image})` }} />)}</div>
        <div className="share-copy">
          <span>Private page</span>
          <h1>Kitchen Remodel Confidence</h1>
          <p>A calm sequence that explains pricing, process, project experience, and next steps.</p>
        </div>
      </section>
      <aside className="journey-list">
        <div className="mini-head">
          <span>Sequence</span>
        </div>
        <Sequence videos={videos.slice(0, 6)} />
      </aside>
    </section>
  );
}

function Sequence({ videos }: { videos: Video[] }) {
  return <div>{videos.map((video, index) => <div className="sequence-item" key={video.id}><span>{index + 1}</span><div><strong>{video.title}</strong><small>{video.type} / {video.duration}</small></div></div>)}</div>;
}

function SimpleGate({ title, body, onBack }: { title: string; body: string; onBack: () => void }) {
  return (
    <main className="role-gate">
      <button className="text-button" onClick={onBack}>Back</button>
      <section className="gate-intro">
        <span>Setup</span>
        <h1>{title}</h1>
        <p>{body}</p>
      </section>
    </main>
  );
}

function mapDbVideo(video: DbVideo): Video {
  return {
    id: video.id,
    title: video.title,
    source: video.source_platform || "Manual",
    duration: formatDuration(video.duration_seconds),
    type: video.proof_type || "Saved",
    image: video.thumbnail_url || "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1000&q=80",
    summary: video.summary || video.transcript?.slice(0, 180) || "No summary yet.",
    use: video.suggested_use || "Decide where this belongs in the sales journey.",
    tags: video.tags ?? []
  };
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "--";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function parseDuration(duration: string) {
  const [minutes, seconds] = duration.split(":").map(Number);
  return minutes * 60 + seconds;
}

function emptyToNull(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}
