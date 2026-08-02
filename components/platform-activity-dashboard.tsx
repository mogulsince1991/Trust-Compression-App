"use client";

import { Activity, ArrowLeft, Building2, Download, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "./platform-activity-dashboard.module.css";

type ActivityReport = {
  role: string;
  generatedAt: string;
  range: { days: number; since: string };
  summary: Record<string, number>;
  daily: Array<{ date: string; users: number; events: number; journeyOpens: number }>;
  featureUsage: Array<{ label: string; value: number }>;
  workspaces: Array<Record<string, any>>;
  users: Array<Record<string, any>>;
  timeline: Array<Record<string, any>>;
};

const tabs = ["Overview", "Workspaces", "Users", "Timeline"] as const;

export function PlatformActivityDashboard() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [report, setReport] = useState<ActivityReport | null>(null);
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadReport();
  }, [days]);

  async function loadReport() {
    if (!supabase) return;
    setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError("Sign in through the main app before opening platform activity.");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/admin/activity?days=${days}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Platform activity could not be loaded.");
      setReport(payload);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Platform activity could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const workspaces = (report?.workspaces ?? []).filter((row) => !normalizedQuery || `${row.name} ${row.slug}`.toLowerCase().includes(normalizedQuery));
  const users = (report?.users ?? []).filter((row) => !normalizedQuery || row.email.toLowerCase().includes(normalizedQuery));
  const timeline = (report?.timeline ?? []).filter((row) => !normalizedQuery || `${row.label} ${row.workspaceName} ${row.userEmail}`.toLowerCase().includes(normalizedQuery));
  const maxDaily = Math.max(1, ...(report?.daily ?? []).map((row) => row.events + row.journeyOpens));

  function exportCsv() {
    if (!report) return;
    const rows = [
      ["Workspace", "Members", "Active users", "Events", "Journeys", "Imports", "Reports", "Tracking events", "Connections", "Issues", "Last active"],
      ...report.workspaces.map((row) => [row.name, row.members, row.activeUsers, row.events, row.journeys, row.imports, row.reports, row.trackingEvents, row.connectedAccounts, row.integrationIssues, row.lastActiveAt]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `trust-compression-platform-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.back}><ArrowLeft size={17} /> Main app</a>
        <div className={styles.adminMark}><ShieldCheck size={18} /> Platform admin</div>
        <div className={styles.actions}>
          <label className={styles.range}>Range<select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>12 months</option></select></label>
          <button onClick={() => void loadReport()} disabled={loading}><RefreshCw className={loading ? styles.spin : ""} size={17} /> Refresh</button>
          <button onClick={exportCsv} disabled={!report}><Download size={17} /> Export</button>
        </div>
      </header>

      <section className={styles.hero}>
        <div><span>PLATFORM ACTIVITY</span><h1>See where the product is alive.</h1><p>Users, workspaces, feature adoption, journeys, reporting, and integration health in one operational view.</p></div>
        <div className={styles.freshness}><small>REPORT FRESHNESS</small><strong>{report ? formatDateTime(report.generatedAt) : "Loading"}</strong><span>{report?.role?.replaceAll("_", " ") ?? "Admin verification"}</span></div>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {loading && !report ? <div className={styles.loading}><RefreshCw className={styles.spin} /> Building platform report...</div> : report && (
        <>
          <section className={styles.kpis}>
            <Kpi label="Active users" value={report.summary.activeUsers} note={`${report.summary.totalUsers} total accounts`} icon={<Users />} />
            <Kpi label="Active workspaces" value={report.summary.activeWorkspaces} note={`${report.summary.totalWorkspaces} total workspaces`} icon={<Building2 />} />
            <Kpi label="Journeys created" value={report.summary.journeysCreated} note={`${days}-day activity`} icon={<Activity />} />
            <Kpi label="Videos imported" value={report.summary.videosImported} note={`${report.summary.reportRuns} report runs`} icon={<Download />} />
            <Kpi label="Tracking events" value={report.summary.trackingEvents} note={`${report.summary.integrationIssues} integration issues`} icon={<ShieldCheck />} alert={report.summary.integrationIssues > 0} />
          </section>

          <nav className={styles.tabs}>{tabs.map((item) => <button key={item} className={tab === item ? styles.activeTab : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>

          {tab === "Overview" && <section className={styles.overview}>
            <article className={styles.panel}>
              <div className={styles.panelHead}><div><span>ACTIVITY PULSE</span><h2>Daily product movement</h2></div><small>Actions + public journey opens</small></div>
              <div className={styles.chart}>{report.daily.map((row) => <div className={styles.barColumn} key={row.date} title={`${row.date}: ${row.events} actions, ${row.journeyOpens} opens`}><div className={styles.bar} style={{ height: `${Math.max(4, ((row.events + row.journeyOpens) / maxDaily) * 100)}%` }} /><small>{days <= 30 ? row.date.slice(5) : row.date.slice(5, 7)}</small></div>)}</div>
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHead}><div><span>FEATURE ADOPTION</span><h2>What people use</h2></div></div>
              <div className={styles.featureList}>{report.featureUsage.map((row, index) => <div key={row.label}><b>{String(index + 1).padStart(2, "0")}</b><span>{row.label}</span><strong>{formatNumber(row.value)}</strong></div>)}</div>
            </article>
            <article className={`${styles.panel} ${styles.wide}`}>
              <div className={styles.panelHead}><div><span>WORKSPACE SIGNAL</span><h2>Most recently active</h2></div><button onClick={() => setTab("Workspaces")}>View all</button></div>
              <WorkspaceTable rows={report.workspaces.slice(0, 8)} />
            </article>
          </section>}

          {tab !== "Overview" && <section className={styles.panel}>
            <div className={styles.panelHead}><div><span>{tab.toUpperCase()}</span><h2>{tab === "Timeline" ? "Auditable activity stream" : `Platform ${tab.toLowerCase()}`}</h2></div><label className={styles.search}><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Filter ${tab.toLowerCase()}...`} /></label></div>
            {tab === "Workspaces" && <WorkspaceTable rows={workspaces} />}
            {tab === "Users" && <UserTable rows={users} />}
            {tab === "Timeline" && <Timeline rows={timeline} />}
          </section>}
        </>
      )}
    </main>
  );
}

function Kpi({ label, value, note, icon, alert = false }: { label: string; value: number; note: string; icon: React.ReactNode; alert?: boolean }) {
  return <article className={`${styles.kpi} ${alert ? styles.alert : ""}`}><div><span>{label}</span>{icon}</div><strong>{formatNumber(value)}</strong><p>{note}</p></article>;
}

function WorkspaceTable({ rows }: { rows: Array<Record<string, any>> }) {
  return <div className={styles.tableWrap}><table><thead><tr><th>Workspace</th><th>Members</th><th>Activity</th><th>Journeys</th><th>Imports</th><th>Reports</th><th>Connections</th><th>Last active</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.slug}</small></td><td>{row.members}</td><td>{row.events}</td><td>{row.journeys}</td><td>{row.imports}</td><td>{row.reports}</td><td><span className={row.integrationIssues ? styles.issue : styles.healthy}>{row.connectedAccounts} / {row.integrationIssues} issues</span></td><td>{formatDateTime(row.lastActiveAt)}</td></tr>)}</tbody></table>{!rows.length && <p className={styles.empty}>No matching workspaces.</p>}</div>;
}

function UserTable({ rows }: { rows: Array<Record<string, any>> }) {
  return <div className={styles.tableWrap}><table><thead><tr><th>User</th><th>Workspaces</th><th>Account created</th><th>Last sign in</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.email}</strong></td><td>{row.workspaceCount}</td><td>{formatDateTime(row.createdAt)}</td><td>{formatDateTime(row.lastSignInAt)}</td></tr>)}</tbody></table>{!rows.length && <p className={styles.empty}>No matching users.</p>}</div>;
}

function Timeline({ rows }: { rows: Array<Record<string, any>> }) {
  return <div className={styles.timeline}>{rows.map((row, index) => <div key={`${row.type}-${row.occurredAt}-${index}`}><span className={styles.timelineDot} /><div><strong>{row.label}</strong><p>{row.workspaceName} · {row.userEmail}</p></div><small>{formatDateTime(row.occurredAt)}</small></div>)}{!rows.length && <p className={styles.empty}>No matching activity.</p>}</div>;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatNumber(value: number) { return new Intl.NumberFormat().format(value ?? 0); }
function csvCell(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
