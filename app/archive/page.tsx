"use client";

import Link from "next/link";
import { Archive, ArrowLeft, ExternalLink, FolderTree, Loader2, RotateCcw, Trash2, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
};

type JourneyVideo = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  sourcePlatform: string | null;
  durationSeconds: number | null;
};

type ManagedJourney = {
  id: string;
  title: string;
  heading: string | null;
  description: string | null;
  folderId: string | null;
  shareUrl: string;
  createdAt: string;
  archivedAt: string | null;
  isPublic: boolean;
  videos: JourneyVideo[];
};

type ArchivedVideo = {
  id: string;
  title: string;
  sourcePlatform: string | null;
  thumbnailUrl: string | null;
  salesCategory: string | null;
  funnelStage: string | null;
  archivedAt: string | null;
};

type ArchivePayload = {
  activeJourneys?: ManagedJourney[];
  archivedJourneys?: ManagedJourney[];
  archivedVideos?: ArchivedVideo[];
  folders?: FolderRow[];
  error?: string;
};

type ViewMode = "journeys" | "archive";

export default function ArchivePage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [mode, setMode] = useState<ViewMode>("journeys");
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<ArchivePayload>({});

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setError("Supabase is not configured.");
      return;
    }

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session) {
      setLoading(false);
      return;
    }

    let active = true;

    async function openWorkspace() {
      setLoading(true);
      setError("");
      const { data, error: workspaceError } = await supabase.rpc("ensure_workspace", { workspace_name: "Trust Library" });
      if (!active) return;

      if (workspaceError || !data) {
        setError(workspaceError?.message ?? "Could not open your workspace.");
        setLoading(false);
        return;
      }

      setWorkspaceId(data as string);
      await loadArchive(data as string, session.access_token, active);
    }

    void openWorkspace();

    return () => {
      active = false;
    };
  }, [session, supabase]);

  async function loadArchive(nextWorkspaceId = workspaceId, accessToken = session?.access_token ?? "", active = true) {
    if (!nextWorkspaceId || !accessToken) return;

    setLoading(true);
    setError("");
    const response = await fetch(`/api/archive?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const result = (await response.json()) as ArchivePayload;

    if (!active) return;
    if (!response.ok) {
      setError(result.error ?? "Could not load archive.");
    } else {
      setPayload(result);
    }
    setLoading(false);
  }

  async function runAction(label: string, id: string, url: string, method: "POST" | "DELETE", extra?: Record<string, unknown>) {
    if (!session || !workspaceId) return;
    const destructive = method === "DELETE";
    if (destructive && !window.confirm("Permanently delete this item? This cannot be undone if the database allows it.")) return;

    setWorkingId(id);
    setNotice("");
    setError("");

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ workspaceId, ...(extra ?? {}) })
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string; detail?: string };

    if (!response.ok) {
      setError(result.error ?? `${label} failed.`);
    } else {
      setNotice(label);
      await loadArchive();
    }
    setWorkingId("");
  }

  const folderPath = useMemo(() => makeFolderPath(payload.folders ?? []), [payload.folders]);

  if (!session && !loading) {
    return (
      <main className="archive-page">
        <section className="archive-empty">
          <Archive size={26} />
          <h1>Sign in to manage archive</h1>
          <p>Archived videos and journeys are tied to your workspace, so you need to be signed in before this page can load them.</p>
          <Link className="archive-primary" href="/">
            Back to sign in
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="archive-page">
      <header className="archive-header">
        <div>
          <Link className="archive-back" href="/">
            <ArrowLeft size={16} /> Library
          </Link>
          <p className="archive-kicker">Workspace management</p>
          <h1>Archive and journeys</h1>
        </div>
        <nav className="archive-tabs" aria-label="Archive views">
          <button className={mode === "journeys" ? "active" : ""} onClick={() => setMode("journeys")}>Active journeys</button>
          <button className={mode === "archive" ? "active" : ""} onClick={() => setMode("archive")}>Archive</button>
        </nav>
      </header>

      {loading && (
        <section className="archive-loading">
          <Loader2 className="spin" size={18} /> Loading workspace
        </section>
      )}

      {notice && <p className="archive-notice">{notice}</p>}
      {error && <p className="archive-error">{error}</p>}

      {!loading && mode === "journeys" && (
        <section className="archive-section">
          <div className="archive-section-head">
            <div>
              <p className="archive-kicker">Configured journeys</p>
              <h2>Active journey library</h2>
            </div>
            <span>{payload.activeJourneys?.length ?? 0} saved</span>
          </div>
          <div className="archive-grid">
            {(payload.activeJourneys ?? []).map((journey) => (
              <JourneyCard
                key={journey.id}
                journey={journey}
                folderName={journey.folderId ? folderPath[journey.folderId] : "Unfiled"}
                busy={workingId === journey.id}
                primaryAction={{ label: "Archive", icon: <Archive size={15} />, onClick: () => runAction("Journey archived.", journey.id, `/api/journeys/${journey.id}/archive`, "POST") }}
              />
            ))}
          </div>
          {!(payload.activeJourneys ?? []).length && <EmptyState title="No active journeys yet" copy="Published or saved journeys will appear here with their videos and folder path." />}
        </section>
      )}

      {!loading && mode === "archive" && (
        <section className="archive-columns">
          <div className="archive-section">
            <div className="archive-section-head">
              <div>
                <p className="archive-kicker">Recover journeys</p>
                <h2>Archived journeys</h2>
              </div>
              <span>{payload.archivedJourneys?.length ?? 0}</span>
            </div>
            <div className="archive-list">
              {(payload.archivedJourneys ?? []).map((journey) => (
                <JourneyCard
                  key={journey.id}
                  journey={journey}
                  folderName={journey.folderId ? folderPath[journey.folderId] : "Unfiled"}
                  busy={workingId === journey.id}
                  primaryAction={{ label: "Restore", icon: <RotateCcw size={15} />, onClick: () => runAction("Journey restored.", journey.id, `/api/journeys/${journey.id}/restore`, "POST") }}
                  dangerAction={{ label: "Delete", icon: <Trash2 size={15} />, onClick: () => runAction("Journey permanently deleted.", journey.id, `/api/journeys/${journey.id}/purge`, "DELETE") }}
                />
              ))}
            </div>
            {!(payload.archivedJourneys ?? []).length && <EmptyState title="No archived journeys" copy="Journeys you archive will appear here so you can restore or permanently delete them later." />}
          </div>

          <div className="archive-section">
            <div className="archive-section-head">
              <div>
                <p className="archive-kicker">Recover videos</p>
                <h2>Archived videos</h2>
              </div>
              <span>{payload.archivedVideos?.length ?? 0}</span>
            </div>
            <div className="archive-list">
              {(payload.archivedVideos ?? []).map((video) => (
                <article key={video.id} className="archive-video-card">
                  <MediaThumb title={video.title} thumbnailUrl={video.thumbnailUrl} />
                  <div>
                    <strong>{video.title || "Untitled video"}</strong>
                    <small>{[video.sourcePlatform, video.salesCategory, video.funnelStage].filter(Boolean).join(" / ") || "No context set"}</small>
                  </div>
                  <div className="archive-card-actions">
                    <button disabled={workingId === video.id} onClick={() => runAction("Video restored.", video.id, `/api/videos/${video.id}/restore`, "POST")}>
                      <RotateCcw size={14} /> Restore
                    </button>
                    <button className="danger" disabled={workingId === video.id} onClick={() => runAction("Video permanently deleted.", video.id, `/api/videos/${video.id}/purge`, "DELETE")}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {!(payload.archivedVideos ?? []).length && <EmptyState title="No archived videos" copy="Videos archived from the library will appear here." />}
          </div>
        </section>
      )}
    </main>
  );
}

function JourneyCard({
  journey,
  folderName,
  busy,
  primaryAction,
  dangerAction
}: {
  journey: ManagedJourney;
  folderName: string;
  busy: boolean;
  primaryAction: { label: string; icon: React.ReactNode; onClick: () => void };
  dangerAction?: { label: string; icon: React.ReactNode; onClick: () => void };
}) {
  return (
    <article className="archive-journey-card">
      <div className="archive-journey-body">
        <div className="archive-folder-line">
          <FolderTree size={14} /> {folderName}
        </div>
        <h3>{journey.title || journey.heading || "Untitled journey"}</h3>
        {journey.description && <p>{journey.description}</p>}
        <div className="archive-thumbs" aria-label="Journey videos">
          {journey.videos.slice(0, 6).map((video, index) => (
            <MediaThumb key={`${video.id}-${index}`} title={video.title} thumbnailUrl={video.thumbnailUrl} />
          ))}
          {journey.videos.length > 6 && <span className="archive-more">+{journey.videos.length - 6}</span>}
          {!journey.videos.length && <span className="archive-no-video"><Video size={15} /> No videos</span>}
        </div>
      </div>
      <div className="archive-card-actions">
        {journey.shareUrl && (
          <a href={journey.shareUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Open
          </a>
        )}
        <button disabled={busy} onClick={primaryAction.onClick}>
          {primaryAction.icon} {primaryAction.label}
        </button>
        {dangerAction && (
          <button className="danger" disabled={busy} onClick={dangerAction.onClick}>
            {dangerAction.icon} {dangerAction.label}
          </button>
        )}
      </div>
    </article>
  );
}

function MediaThumb({ title, thumbnailUrl }: { title: string; thumbnailUrl: string | null }) {
  if (thumbnailUrl) return <img src={thumbnailUrl} alt="" title={title} loading="lazy" />;
  return <span className="archive-thumb-fallback"><Video size={16} /></span>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="archive-empty-inline">
      <Archive size={20} />
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

function makeFolderPath(folders: FolderRow[]) {
  const map = new Map(folders.map((folder) => [folder.id, folder]));
  const result: Record<string, string> = {};

  for (const folder of folders) {
    const names: string[] = [];
    let current: FolderRow | undefined = folder;
    let guard = 0;
    while (current && guard < 6) {
      names.unshift(current.name);
      current = current.parent_id ? map.get(current.parent_id) : undefined;
      guard += 1;
    }
    result[folder.id] = names.join(" / ");
  }

  return result;
}
