"use client";

import { Activity, ArrowRight, BookOpen, Building2, Home, LogOut, Moon, MoreHorizontal, Route, Settings, Sun, BarChart3, Monitor, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { WorkspaceRow } from "./trust-app-shared";

export const sageRoutes = { archive: "journeys/archive", home: "home", library: "library", journeys: "journeys", editor: "journeys/editor", metrics: "activity", reports: "reports", workspace: "settings", sources: "settings/content", socialProfiles: "settings/youtube", tracking: "activity/links" } as const;
export type SageView = keyof typeof sageRoutes;
export function viewFromPath(path: string): SageView {
  if (path.startsWith("/app/settings/youtube/")) return "socialProfiles";
  const route = path.replace(/^\/app\/?/, "").replace(/\/$/, "");
  return (Object.entries(sageRoutes).find(([, value]) => value === route)?.[0] as SageView) || "home";
}

export function AppearanceControl() {
  const [mode, setMode] = useState("system");
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let preferred = "system";
    try { preferred = localStorage.getItem("trusttale-appearance") || "system"; } catch {}
    setMode(preferred);
    const apply = () => { document.documentElement.dataset.sageTheme = (preferred === "system" ? media.matches ? "dark" : "light" : preferred); };
    apply();
  }, []);
  function change(value: string) {
    setMode(value);
    try { localStorage.setItem("trusttale-appearance", value); } catch {}
    document.documentElement.dataset.sageTheme = value === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : value;
  }
  useEffect(() => {
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { document.documentElement.dataset.sageTheme = media.matches ? "dark" : "light"; };
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode]);
  return <label className="sage-appearance"><span className="sr-only">Appearance</span>{mode === "dark" ? <Moon /> : mode === "light" ? <Sun /> : <Monitor />}<select aria-label="Appearance" value={mode} onChange={e => change(e.target.value)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>;
}

const navigation = [{ view: "home", label: "Home", icon: Home }, { view: "library", label: "Library", icon: BookOpen }, { view: "journeys", label: "Journeys", icon: Route }, { view: "metrics", label: "Activity", icon: Activity }, { view: "reports", label: "Reports", icon: BarChart3 }] as const;
export function SageShell({ view, workspaces, workspaceId, onSwitch, onNavigate, onSignOut, isAdmin, children, busy, notice, error, onDismiss }: { view: SageView; workspaces: WorkspaceRow[]; workspaceId: string | null; onSwitch: (id: string) => void; onNavigate: (view: SageView) => void; onSignOut: () => void; isAdmin: boolean; children: ReactNode; busy?: boolean; notice: string; error: string; onDismiss: () => void }) {
  const [more, setMore] = useState(false);
  useEffect(() => { document.getElementById("sage-content")?.scrollTo(0, 0); }, [view]);
  const active = (view === "editor" || view === "archive") ? "journeys" : view === "tracking" ? "metrics" : ["sources", "socialProfiles"].includes(view) ? "workspace" : view;
  function go(next: SageView) { setMore(false); onNavigate(next); }
  return <div className="sage-app">
    <a href="#sage-content" className="sage-skip">Skip to content</a>
    <aside className="sage-sidebar"><a className="sage-wordmark" href="/app/home" onClick={e => { e.preventDefault(); go("home"); }}>TrustTale<span className="sage-brand-dot" /></a>
      <label className="sage-workspace"><Building2 /><span className="sr-only">Current workspace</span><select aria-label="Current workspace" disabled={busy} value={workspaceId || ""} onChange={e => onSwitch(e.target.value)}>{workspaces.map(w => <option value={w.id} key={w.id}>{w.name}</option>)}</select></label>
      <nav aria-label="Main navigation">{navigation.map(n => <a key={n.view} href={`/app/${sageRoutes[n.view]}`} aria-current={active === n.view ? "page" : undefined} onClick={e => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); go(n.view); } }}><n.icon />{n.label}</a>)}</nav>
      <div className="sage-sidebar-bottom"><button className={active === "workspace" ? "is-active" : ""} onClick={() => go("workspace")}><Settings />Settings</button>{isAdmin && <a href="/admin/activity">Platform administration <ArrowRight /></a>}<button onClick={onSignOut}><LogOut />Sign out</button><small>The right proof.<br />Ready to share.</small></div>
    </aside>
    <div className="sage-main"><header className="sage-topbar"><span>{workspaces.find(w => w.id === workspaceId)?.name || "Your workspace"}</span><AppearanceControl /></header>
      <main id="sage-content" tabIndex={-1} aria-busy={busy}>{(notice || error) && <div className={`sage-notice ${error ? "is-error" : ""}`} role={error ? "alert" : "status"}><span>{error || notice}</span><button onClick={onDismiss} aria-label="Dismiss message"><X /></button></div>}{busy ? <div className="sage-loading" role="status"><span className="sage-loading-line" />Opening this workspace...</div> : children}</main>
    </div>
    {more && <div className="sage-more"><button onClick={() => setMore(false)} aria-label="Close menu"><X /></button><label>Workspace<select aria-label="Switch workspace" value={workspaceId || ""} onChange={e => { onSwitch(e.target.value); setMore(false); }}>{workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label><button onClick={() => go("reports")}><BarChart3 />Reports</button><button onClick={() => go("workspace")}><Settings />Settings</button>{isAdmin && <a href="/admin/activity">Platform administration</a>}<button onClick={onSignOut}><LogOut />Sign out</button></div>}
    <nav className="sage-mobile-nav" aria-label="Mobile navigation">{navigation.slice(0, 4).map(n => <button key={n.view} aria-current={active === n.view ? "page" : undefined} onClick={() => go(n.view)}><n.icon /><span>{n.label}</span></button>)}<button aria-expanded={more} onClick={() => setMore(!more)}><MoreHorizontal /><span>More</span></button></nav>
  </div>;
}
