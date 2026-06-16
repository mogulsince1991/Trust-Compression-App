"use client";

import Link from "next/link";
import { ArrowLeft, ImageIcon, Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type DbVideo = {
  id: string;
  title: string;
  source_platform: string;
  thumbnail_url: string | null;
  metadata: Record<string, any> | null;
  created_at: string | null;
};

type Draft = {
  title: string;
  thumbnailUrl: string;
};

export default function VideoOverridesPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [videos, setVideos] = useState<DbVideo[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

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

    async function load() {
      setLoading(true);
      setError("");
      const { data: id, error: workspaceError } = await supabase.rpc("ensure_workspace", { workspace_name: "Trust Library" });
      if (!active) return;
      if (workspaceError || !id) {
        setError(workspaceError?.message ?? "Could not open workspace.");
        setLoading(false);
        return;
      }

      setWorkspaceId(id as string);
      const { data, error: videosError } = await supabase
        .from("videos")
        .select("id,title,source_platform,thumbnail_url,metadata,created_at")
        .eq("workspace_id", id)
        .is("deleted_at", null)
        .order("published_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });

      if (!active) return;
      if (videosError) {
        setError(videosError.message);
      } else {
        const rows = (data ?? []) as DbVideo[];
        setVideos(rows);
        setDrafts(Object.fromEntries(rows.map((video) => [video.id, { title: video.title ?? "", thumbnailUrl: video.thumbnail_url ?? "" }])));
      }
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [session, supabase]);

  async function save(video: DbVideo) {
    if (!session || !workspaceId) return;
    const draft = drafts[video.id];
    if (!draft) return;

    setWorkingId(video.id);
    setNotice("");
    setError("");

    const response = await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ workspaceId, title: draft.title, thumbnailUrl: draft.thumbnailUrl })
    });
    const result = (await response.json().catch(() => ({}))) as { video?: DbVideo; error?: string };

    if (!response.ok || !result.video) {
      setError(result.error ?? "Could not save override.");
    } else {
      setVideos((current) => current.map((item) => (item.id === video.id ? { ...item, ...result.video } : item)));
      setDrafts((current) => ({
        ...current,
        [video.id]: {
          title: result.video?.title ?? draft.title,
          thumbnailUrl: result.video?.thumbnail_url ?? draft.thumbnailUrl
        }
      }));
      setNotice("Video display title and thumbnail saved.");
    }
    setWorkingId("");
  }

  if (!session && !loading) {
    return (
      <main className="archive-page video-overrides-page">
        <section className="archive-empty">
          <ImageIcon size={26} />
          <h1>Sign in to edit videos</h1>
          <p>Display titles and thumbnail links are saved to your workspace library.</p>
          <Link className="archive-primary" href="/">Back to sign in</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="archive-page video-overrides-page">
      <header className="archive-header">
        <div>
          <Link className="archive-back" href="/">
            <ArrowLeft size={16} /> Library
          </Link>
          <p className="archive-kicker">Library overrides</p>
          <h1>Video titles and thumbnails</h1>
        </div>
      </header>

      {loading && <section className="archive-loading"><Loader2 className="spin" size={18} /> Loading videos</section>}
      {notice && <p className="archive-notice">{notice}</p>}
      {error && <p className="archive-error">{error}</p>}

      {!loading && (
        <section className="video-override-list">
          {videos.map((video) => {
            const draft = drafts[video.id] ?? { title: video.title ?? "", thumbnailUrl: video.thumbnail_url ?? "" };
            return (
              <article className="video-override-card" key={video.id}>
                <span className="video-override-thumb" style={{ backgroundImage: `url(${draft.thumbnailUrl || video.thumbnail_url || ""})` }} />
                <div className="video-override-fields">
                  <small>{video.source_platform}</small>
                  <label>
                    <span>Display title</span>
                    <input value={draft.title} onChange={(event) => setDrafts((current) => ({ ...current, [video.id]: { ...draft, title: event.target.value } }))} />
                  </label>
                  <label>
                    <span>Thumbnail image URL</span>
                    <input value={draft.thumbnailUrl} onChange={(event) => setDrafts((current) => ({ ...current, [video.id]: { ...draft, thumbnailUrl: event.target.value } }))} placeholder="https://drive.google.com/... or https://...jpg" />
                  </label>
                </div>
                <button className="video-override-save" disabled={workingId === video.id} onClick={() => save(video)}>
                  {workingId === video.id ? <Loader2 className="spin" size={15} /> : <Save size={15} />} Save
                </button>
              </article>
            );
          })}
          {!videos.length && <p className="archive-notice">No active videos yet.</p>}
        </section>
      )}
    </main>
  );
}
