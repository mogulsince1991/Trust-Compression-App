"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { collectionKinds } from "@/lib/source-refresh";
import { parseSourceUrl } from "@/lib/source-import";

type Progress = { total: number; completed: number; errors: string[]; running: boolean };
type RefreshRun = { progress: Progress; listeners: Set<(value: Progress) => void>; done: Promise<void> };
const activeRuns = new Map<string, RefreshRun>();

function refreshCollections(key: string, workspaceId: string) {
  const current = activeRuns.get(key);
  if (current) return current;
  const run: RefreshRun = { progress: { total: 0, completed: 0, errors: [], running: true }, listeners: new Set(), done: Promise.resolve() };
  activeRuns.set(key, run);
  function update(change: Partial<Progress>) {
    run.progress = { ...run.progress, ...change };
    run.listeners.forEach(listener => listener(run.progress));
  }
  run.done = (async () => {
    try {
      const db = createBrowserSupabaseClient();
      if (!db) throw new Error("Library connection is unavailable.");
      const sources: Array<{ id: string; account_label: string | null; metadata: Record<string, unknown> | null }> = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await db.from("sources").select("id,account_label,metadata").eq("workspace_id", workspaceId).order("id").range(offset, offset + 499);
        if (error) throw new Error(error.message);
        sources.push(...(data ?? []));
        if (!data || data.length < 500) break;
      }
      const collections = sources.filter(source => {
        if (collectionKinds.has(String(source.metadata?.kind))) return true;
        try { return collectionKinds.has(parseSourceUrl(String(source.metadata?.sourceUrl ?? source.metadata?.canonicalUrl ?? "")).kind); }
        catch { return false; }
      });
      update({ total: collections.length });
      // One source at a time keeps imports from competing for provider quotas.
      for (const source of collections) {
        try {
          const { data: { session } } = await db.auth.getSession();
          if (!session || !key.startsWith(session.user.id + ":")) throw new Error("Sign in again to refresh your sources.");
          const response = await fetch(`/api/sources/${source.id}/reimport`, {
            method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId, fullRefresh: true }),
            signal: AbortSignal.timeout(310000)
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || "Source could not refresh. Try again.");
        } catch (error) {
          update({ errors: [...run.progress.errors, `${source.account_label || "Connected source"}: ${error instanceof Error ? error.message : "Refresh failed."}`] });
        }
        update({ completed: run.progress.completed + 1 });
      }
    } catch (error) {
      update({ errors: [error instanceof Error ? error.message : "Could not load connected sources."] });
    } finally {
      update({ running: false });
      activeRuns.delete(key);
    }
  })();
  return run;
}

export function LibrarySourceRefresh({ workspaceId, userId, onComplete }: { workspaceId: string; userId: string; onComplete: (isActive: () => boolean) => Promise<void> }) {
  const [progress, setProgress] = useState<Progress>({ total: 0, completed: 0, errors: [], running: true });
  const [attempt, setAttempt] = useState(0);
  const callback = useRef(onComplete);
  callback.current = onComplete;
  useEffect(() => {
    let active = true;
    const run = refreshCollections(`${userId}:${workspaceId}`, workspaceId);
    setProgress(run.progress);
    const listener = (value: Progress) => { if (active) setProgress(value); };
    run.listeners.add(listener);
    void run.done.then(async () => {
      if (!active) return;
      try { await callback.current(() => active); }
      catch { if (active) setProgress(value => ({ ...value, errors: [...value.errors, "Content refreshed, but the library could not reload. Try again."] })); }
    });
    return () => { active = false; run.listeners.delete(listener); };
  }, [workspaceId, userId, attempt]);

  if (!progress.running && !progress.total && !progress.errors.length) return null;
  return <div className="library-refresh">
    <p role="status" aria-live="polite"><RefreshCw size={16} className={progress.running ? "spin" : ""} aria-hidden="true" />
      {progress.running ? `Refreshing${progress.total ? ` ${progress.completed}/${progress.total} sources` : ""}...` : progress.errors.length ? "Some sources could not refresh" : "Connected sources refreshed"}
      {progress.running && <small>You can keep using your content.</small>}
    </p>
    {!!progress.errors.length && <details><summary>View refresh details ({progress.errors.length})</summary><ul>{progress.errors.map((error, index) => <li key={index}>{error}</li>)}</ul></details>}
    {!progress.running && <button type="button" onClick={() => setAttempt(value => value + 1)}>{progress.errors.length ? "Retry refresh" : "Refresh again"}</button>}
  </div>;
}
