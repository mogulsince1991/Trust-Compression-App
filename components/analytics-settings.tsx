"use client";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { browserExcluded, setBrowserExcluded } from "@/lib/analytics-preferences";

export function AnalyticsSettings({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const [excluded, setExcluded] = useState(false);
  const [ips, setIps] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  async function headers() { const session = await createBrowserSupabaseClient()?.auth.getSession(); return { "Content-Type": "application/json", Authorization: `Bearer ${session?.data.session?.access_token || ""}` }; }
  useEffect(() => {
    let disposed = false;
    setExcluded(browserExcluded()); setReady(false);
    void headers().then(h => fetch(`/api/workspaces/${workspaceId}/analytics-settings`, { headers: h })).then(async r => { if (!r.ok) throw Error("Could not load settings."); return r.json(); }).then(d => { if (!disposed) { setIps(d.excludedIps.join("\n")); setReady(true); } }).catch(() => { if (!disposed) setNotice("Could not load analytics settings."); });
    return () => { disposed = true; };
  }, [workspaceId]);
  return <section className="workspace-panel"><h2>Analytics exclusions</h2><p>Workspace member visits and editor previews do not count as customer engagement. Google Drive, Loom and social embeds do not report verified watch time.</p><label><input type="checkbox" checked={excluded} onChange={e => { try { setBrowserExcluded(e.target.checked); setExcluded(e.target.checked); setNotice("Browser preference saved."); } catch { setNotice("Browser storage is unavailable."); } }} /> Exclude this browser from journey analytics</label><p>This preference applies only to this browser and domain. Set it on each public journey domain you use. It does not reduce Google's playback quota.</p><form onSubmit={async e => { e.preventDefault(); setSaving(true); try { const r = await fetch(`/api/workspaces/${workspaceId}/analytics-settings`, { method: "PATCH", headers: await headers(), body: JSON.stringify({ excludedIps: ips.split(/[\n,]+/).map(v => v.trim()).filter(Boolean) }) }); const d = await r.json(); if (!r.ok) throw Error(d.error); setNotice("IP exclusions saved."); } catch (error) { setNotice(error instanceof Error ? error.message : "Save failed."); } finally { setSaving(false); } }}><label>Optional office IP exclusions (one address per line)<textarea value={ips} onChange={e => setIps(e.target.value)} disabled={!canManage || !ready} /></label><p>Everyone sharing these addresses will be excluded. Mobile addresses can change.</p><button disabled={!canManage || !ready || saving}>Save exclusions</button></form><p role="status">{notice}</p></section>;
}
