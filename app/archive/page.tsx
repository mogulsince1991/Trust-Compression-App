"use client";

import Link from "next/link";
import { Archive, ArrowLeft, Code2, Edit3, ExternalLink, FolderTree, Link2, Loader2, RotateCcw, Send, Trash2, Video, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
  ctaLabel: string | null;
  ctaUrl: string | null;
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

type ContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  company: string | null;
  phone: string | null;
};

type JourneySend = {
  id: string;
  journeyId: string;
  contactId: string | null;
  shareToken: string;
  shareUrl: string;
  createdAt: string;
  contact: Pick<ContactRow, "id" | "name" | "email" | "company"> | null;
};

type ArchivePayload = {
  activeJourneys?: ManagedJourney[];
  archivedJourneys?: ManagedJourney[];
  archivedVideos?: ArchivedVideo[];
  folders?: FolderRow[];
  contacts?: ContactRow[];
  sends?: JourneySend[];
  error?: string;
};

type ViewMode = "journeys" | "archive";

type JourneyEditDraft = {
  title: string;
  heading: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
};

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
  const [editing, setEditing] = useState<ManagedJourney | null>(null);
  const [editDraft, setEditDraft] = useState<JourneyEditDraft>({ title: "", heading: "", description: "", ctaLabel: "", ctaUrl: "" });

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

  function openEdit(journey: ManagedJourney) {
    setEditing(journey);
    setEditDraft({
      title: journey.title ?? "",
      heading: journey.heading ?? "",
      description: journey.description ?? "",
      ctaLabel: journey.ctaLabel ?? "Continue the conversation",
      ctaUrl: journey.ctaUrl ?? ""
    });
  }

  async function saveJourneyEdit() {
    if (!editing || !session || !workspaceId) return;
    setWorkingId(editing.id);
    setNotice("");
    setError("");

    const response = await fetch(`/api/journeys/${editing.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ workspaceId, ...editDraft, videoIds: editing.videos.map((video) => video.id), publish: true })
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? "Could not update journey.");
    } else {
      setNotice("Journey updated.");
      setEditing(null);
      await loadArchive();
    }
    setWorkingId("");
  }

  async function createClientLink(journeyId: string, contact: { contactId?: string; name?: string; email?: string; company?: string }) {
    if (!session || !workspaceId) return;
    setWorkingId(`${journeyId}:send`);
    setNotice("");
    setError("");

    const response = await fetch(`/api/journeys/${journeyId}/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ workspaceId, contactId: contact.contactId, contact: contact.contactId ? undefined : { name: contact.name, email: contact.email, company: contact.company } })
    });
    const result = (await response.json().catch(() => ({}))) as { shareUrl?: string; error?: string };

    if (!response.ok || !result.shareUrl) {
      setError(result.error ?? "Could not create client journey link.");
    } else {
      const absolute = new URL(result.shareUrl, window.location.origin).toString();
      await navigator.clipboard?.writeText(absolute).catch(() => undefined);
      setNotice("Client-specific journey link created and copied.");
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
          <p className="archive-kicker">Journey manager</p>
          <h1>Journeys and archive</h1>
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
                busy={workingId === journey.id || workingId === `${journey.id}:send`}
                contacts={payload.contacts ?? []}
                sends={(payload.sends ?? []).filter((send) => send.journeyId === journey.id)}
                onEdit={() => openEdit(journey)}
                onCreateClientLink={(contact) => createClientLink(journey.id, contact)}
                onEmbedCopied={() => setNotice("Embed code copied.")}
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
                  contacts={[]}
                  sends={[]}
                  onEmbedCopied={() => setNotice("Embed code copied.")}
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

      {editing && (
        <section className="archive-modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit journey">
          <div className="archive-modal">
            <div className="archive-modal-head">
              <div>
                <p className="archive-kicker">Edit journey</p>
                <h2>{editing.title || "Untitled journey"}</h2>
              </div>
              <button onClick={() => setEditing(null)} aria-label="Close editor"><X size={17} /> Close</button>
            </div>
            <div className="archive-edit-grid">
              <label><span>Title</span><input value={editDraft.title} onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })} /></label>
              <label><span>Heading</span><input value={editDraft.heading} onChange={(event) => setEditDraft({ ...editDraft, heading: event.target.value })} /></label>
              <label className="wide-field"><span>Description</span><textarea value={editDraft.description} onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })} /></label>
              <label><span>CTA label</span><input value={editDraft.ctaLabel} onChange={(event) => setEditDraft({ ...editDraft, ctaLabel: event.target.value })} /></label>
              <label><span>CTA URL</span><input value={editDraft.ctaUrl} onChange={(event) => setEditDraft({ ...editDraft, ctaUrl: event.target.value })} placeholder="https://..." /></label>
            </div>
            <div className="archive-modal-videos">
              {editing.videos.map((video, index) => <MediaThumb key={`${video.id}-${index}`} title={video.title} thumbnailUrl={video.thumbnailUrl} />)}
            </div>
            <div className="archive-modal-actions">
              <button onClick={() => setEditing(null)}>Cancel</button>
              <button className="primary" disabled={workingId === editing.id} onClick={saveJourneyEdit}>{workingId === editing.id ? <Loader2 className="spin" size={15} /> : <Edit3 size={15} />} Save journey</button>
            </div>
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
  contacts,
  sends,
  onEdit,
  onCreateClientLink,
  onEmbedCopied,
  primaryAction,
  dangerAction
}: {
  journey: ManagedJourney;
  folderName: string;
  busy: boolean;
  contacts: ContactRow[];
  sends: JourneySend[];
  onEdit?: () => void;
  onCreateClientLink?: (contact: { contactId?: string; name?: string; email?: string; company?: string }) => void;
  onEmbedCopied?: () => void;
  primaryAction: { label: string; icon: ReactNode; onClick: () => void };
  dangerAction?: { label: string; icon: ReactNode; onClick: () => void };
}) {
  const [contactId, setContactId] = useState("");
  const [contact, setContact] = useState({ name: "", email: "", company: "" });
  const canCreateLink = Boolean(onCreateClientLink) && (Boolean(contactId) || Boolean(contact.email.trim()) || Boolean(contact.name.trim()));

  async function copyEmbedCode() {
    const embedUrl = makeEmbedUrl(journey.shareUrl);
    if (!embedUrl) return;
    const code = `<iframe src="${embedUrl}" style="width:100%;height:720px;border:0;" allow="autoplay; encrypted-media; picture-in-picture; web-share" allowfullscreen></iframe>`;
    await navigator.clipboard?.writeText(code).catch(() => undefined);
    onEmbedCopied?.();
  }

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
        {onEdit && <button disabled={busy} onClick={onEdit}><Edit3 size={14} /> Edit</button>}
        {journey.shareUrl && (
          <a href={journey.shareUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Open
          </a>
        )}
        {journey.shareUrl && <button disabled={busy} onClick={copyEmbedCode}><Code2 size={14} /> Embed</button>}
        <button disabled={busy} onClick={primaryAction.onClick}>
          {primaryAction.icon} {primaryAction.label}
        </button>
        {dangerAction && (
          <button className="danger" disabled={busy} onClick={dangerAction.onClick}>
            {dangerAction.icon} {dangerAction.label}
          </button>
        )}
      </div>

      {onCreateClientLink && (
        <section className="client-link-panel">
          <div className="client-link-head"><Link2 size={14} /><span>Client-specific links</span></div>
          {sends.length > 0 && (
            <div className="client-send-list">
              {sends.slice(0, 4).map((send) => (
                <a href={send.shareUrl} key={send.id} target="_blank" rel="noreferrer">
                  <strong>{send.contact?.name || send.contact?.email || "Unassigned contact"}</strong>
                  <small>{send.contact?.company || new Date(send.createdAt).toLocaleDateString()}</small>
                </a>
              ))}
            </div>
          )}
          <div className="client-link-form">
            <select value={contactId} onChange={(event) => setContactId(event.target.value)}>
              <option value="">New contact</option>
              {contacts.map((item) => <option value={item.id} key={item.id}>{item.name || item.email || "Unnamed contact"}</option>)}
            </select>
            {!contactId && (
              <>
                <input value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} placeholder="Name" />
                <input value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} placeholder="email@company.com" />
                <input value={contact.company} onChange={(event) => setContact({ ...contact, company: event.target.value })} placeholder="Company" />
              </>
            )}
            <button disabled={busy || !canCreateLink} onClick={() => onCreateClientLink(contactId ? { contactId } : contact)}><Send size={14} /> Create link</button>
          </div>
        </section>
      )}
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

function makeEmbedUrl(shareUrl: string) {
  if (!shareUrl) return "";
  try {
    const url = new URL(shareUrl, window.location.origin);
    const token = url.pathname.split("/").filter(Boolean).at(-1);
    if (!token) return "";
    return `${url.origin}/embed/journey/${token}`;
  } catch {
    return "";
  }
}
