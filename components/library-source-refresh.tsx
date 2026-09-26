"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { uniqueCollections } from "@/lib/source-refresh";
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
      const collections = uniqueCollections(sources, parseSourceUrl);
      update({ total: collections.length });
      // One source at a time keeps imports from competing for provider quotas.
      for (const source of collections) {
        try {
          const { data: { session } } = await db.auth.getSession();
          if (!session || !key.startsWith(session.user.id + ":")) throw new Error("Sign in again to refresh your sources.");
          const response = await fetch(`/api/sources/${source.id}/reimport`, {
            method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId, fullRefresh: true, automatic: true }),
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
      // Retain the settled run: navigation and React remounts must not reimport.
    }
  })();
  return run;
}

export function LibrarySourceRefresh({ workspaceId, userId, onComplete }: { workspaceId: string; userId: string; onComplete: (isActive: () => boolean) => Promise<void> }) {
  const [progress, setProgress] = useState<Progress>({ total: 0, completed: 0, errors: [], running: true });
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
  }, [workspaceId, userId]);

  if (!progress.running || !progress.total) return null;
  return <div className="library-refresh" style={{ position: "fixed", bottom: 80, right: 16, width: "auto", padding: "6px 10px", fontSize: 12, zIndex: 10 }}>
    <p role="status" aria-live="polite"><RefreshCw size={16} className={progress.running ? "spin" : ""} aria-hidden="true" />
      Checking connected collections...
    </p>
  </div>;
}
