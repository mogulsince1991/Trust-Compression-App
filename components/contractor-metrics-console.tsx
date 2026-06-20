"use client";

import Link from "next/link";
import { ArrowUpRight, BarChart3, Check, Database, KeyRound, Link2, Loader2, RefreshCw } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "./contractor-metrics-console.module.css";

type ConnectedAccountRow = {
  id: string;
  workspaceId: string;
  provider: string;
  accountLabel: string | null;
  externalAccountId: string | null;
  tokenType: string | null;
  scope: string | null;
  status: string;
  expiresAt: string | null;
  metadata: {
    authMode?: string | null;
    apiBaseUrl?: string | null;
    locationId?: string | null;
    companyId?: string | null;
    userId?: string | null;
    readonly?: boolean;
    lastSyncSummary?: {
      syncedAt?: string | null;
      imported?: number;
      updated?: number;
      skipped?: number;
      provider?: string;
    } | null;
  } | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ContractorSourceRow = {
  id: string;
  provider: string;
  display_name: string;
  status: string;
  last_synced_at: string | null;
  external_account_id: string | null;
  connected_account_id: string | null;
  last_error: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ReportRow = {
  id: string;
  client_name: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
  totals: Record<string, number | string | null> | null;
};

type JobTreadDraft = {
  accountLabel: string;
  apiToken: string;
  externalAccountId: string;
  apiBaseUrl: string;
};

type GhlDraft = {
  accountLabel: string;
  privateIntegrationToken: string;
  locationId: string;
  externalAccountId: string;
  apiBaseUrl: string;
};

type GhlStatus = {
  oauthConfigured: boolean;
  serviceRoleConfigured: boolean;
  privateIntegrationSupported: boolean;
  callbackUrl?: string;
  authorizeUrl?: string;
};

const emptyJobTreadDraft: JobTreadDraft = {
  accountLabel: "JobTread",
  apiToken: "",
  externalAccountId: "",
  apiBaseUrl: "https://api.jobtread.com",
};

const emptyGhlDraft: GhlDraft = {
  accountLabel: "GoHighLevel",
  privateIntegrationToken: "",
  locationId: "",
  externalAccountId: "",
  apiBaseUrl: "https://services.leadconnectorhq.com",
};

export function ContractorMetricsConsole() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<ConnectedAccountRow[]>([]);
  const [sources, setSources] = useState<ContractorSourceRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [clientName, setClientName] = useState("Trust Compression Contractor Report");
  const [startDate, setStartDate] = useState("2026-06-01");
  const [endDate, setEndDate] = useState("2026-06-30");
  const [ghlDraft, setGhlDraft] = useState<GhlDraft>(emptyGhlDraft);
  const [jobTreadDraft, setJobTreadDraft] = useState<JobTreadDraft>(emptyJobTreadDraft);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [ghlStatus, setGhlStatus] = useState<GhlStatus | null>(null);

  const latestReport = reports[0] ?? null;
  const ghlAccount = accounts.find((account) => account.provider === "ghl") ?? null;

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
        setAccounts([]);
        setSources([]);
        setReports([]);
      }
    });

    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session) return;
    let active = true;

    async function openWorkspace() {
      setLoading(true);
      setError("");
      const { data, error: workspaceError } = await supabase.rpc("ensure_workspace", {
        workspace_name: "Trust Library",
      });

      if (!active) return;
      if (workspaceError || !data) {
        setError(workspaceError?.message ?? "Could not open the workspace.");
        setLoading(false);
        return;
      }

      setWorkspaceId(data);
      await refreshWorkspace(data, session.access_token);
      if (active) setLoading(false);
    }

    void openWorkspace();
    return () => {
      active = false;
    };
  }, [session, supabase]);

  useEffect(() => {
    let active = true;

    async function loadGhlStatus() {
      try {
        const response = await fetch("/api/connect/ghl/status", { cache: "no-store" });
        const result = (await response.json()) as GhlStatus & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load GoHighLevel connection status.");
        if (active) setGhlStatus(result);
      } catch (nextError) {
        if (active) setError(nextError instanceof Error ? nextError.message : "Could not load GoHighLevel connection status.");
      }
    }

    void loadGhlStatus();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const connectSuccess = url.searchParams.get("connect_success");
    const connectError = url.searchParams.get("connect_error");
    if (!connectSuccess && !connectError) return;

    if (connectSuccess) {
      setNotice(readConnectSuccess(connectSuccess));
      setError("");
    }

    if (connectError) {
      setError(readConnectError(connectError));
      setNotice("");
    }

    url.searchParams.delete("connect_success");
    url.searchParams.delete("connect_error");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  async function refreshWorkspace(nextWorkspaceId = workspaceId, accessToken = session?.access_token) {
    if (!supabase || !nextWorkspaceId || !accessToken) return;

    setWorking((current) => current ?? "refresh");

    const [accountsResponse, reportRows, sourceRows] = await Promise.all([
      fetch(`/api/connect/accounts?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      supabase
        .from("contractor_reports")
        .select("id,client_name,start_date,end_date,created_at,totals")
        .eq("workspace_id", nextWorkspaceId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("contractor_data_sources")
        .select("id,provider,display_name,status,last_synced_at,external_account_id,connected_account_id,last_error,created_at,updated_at")
        .eq("workspace_id", nextWorkspaceId)
        .order("updated_at", { ascending: false }),
    ]);

    if (accountsResponse.ok) {
      const result = (await accountsResponse.json()) as { accounts?: ConnectedAccountRow[] };
      setAccounts(result.accounts ?? []);
    } else {
      const result = (await accountsResponse.json().catch(() => ({}))) as { error?: string };
      setError(result.error ?? "Could not load secure connected accounts.");
    }

    setReports((reportRows.data ?? []) as ReportRow[]);
    setSources((sourceRows.data ?? []) as ContractorSourceRow[]);
    setWorking(null);
  }

  async function connectGhl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !session) return;
    setWorking("connect-ghl");
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/connect/ghl", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          workspaceId,
          accountLabel: ghlDraft.accountLabel,
          privateIntegrationToken: ghlDraft.privateIntegrationToken,
          locationId: ghlDraft.locationId,
          externalAccountId: ghlDraft.externalAccountId || undefined,
          apiBaseUrl: ghlDraft.apiBaseUrl,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save GoHighLevel connection.");
      setNotice("GoHighLevel account saved and validated. Run a sync to import leads into the contractor metrics tables.");
      setGhlDraft((current) => ({
        ...current,
        privateIntegrationToken: "",
        externalAccountId: current.externalAccountId,
      }));
      await refreshWorkspace(workspaceId, session.access_token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not save GoHighLevel connection.");
    } finally {
      setWorking(null);
    }
  }

  async function startGhlOauth() {
    if (!workspaceId || !session) return;
    setWorking("start-ghl-oauth");
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/connect/ghl/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ workspaceId, redirectTo: "/contractor-metrics" }),
      });
      const result = (await response.json()) as { authUrl?: string; error?: string };
      if (!response.ok || !result.authUrl) {
        throw new Error(result.error ?? "Could not start GoHighLevel OAuth.");
      }
      window.location.href = result.authUrl;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not start GoHighLevel OAuth.");
      setWorking(null);
    }
  }

  async function connectJobTread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !session) return;

    setWorking("connect-jobtread");
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/connect/jobtread", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          workspaceId,
          accountLabel: jobTreadDraft.accountLabel,
          apiToken: jobTreadDraft.apiToken,
          externalAccountId: jobTreadDraft.externalAccountId || undefined,
          apiBaseUrl: jobTreadDraft.apiBaseUrl,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save JobTread connection.");
      setNotice("JobTread account saved. Run a sync to import jobs into the contractor metrics tables.");
      setJobTreadDraft((current) => ({ ...current, apiToken: "", externalAccountId: current.externalAccountId }));
      await refreshWorkspace(workspaceId, session.access_token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not save JobTread connection.");
    } finally {
      setWorking(null);
    }
  }

  async function syncAccount(account: ConnectedAccountRow) {
    if (!workspaceId || !session) return;

    setWorking(`sync-${account.id}`);
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/metrics/contractor/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ workspaceId, connectedAccountId: account.id }),
      });
      const result = (await response.json()) as { imported?: number; updated?: number; skipped?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not sync provider.");
      setNotice(`Sync complete. Imported ${result.imported ?? 0}, updated ${result.updated ?? 0}, skipped ${result.skipped ?? 0}.`);
      await refreshWorkspace(workspaceId, session.access_token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not sync provider.");
    } finally {
      setWorking(null);
    }
  }

  async function generateReport() {
    if (!workspaceId || !session) return;

    setWorking("report");
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/metrics/contractor/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ workspaceId, startDate, endDate, clientName }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not generate contractor report.");
      setNotice("Report generated from the normalized contractor metrics tables.");
      await refreshWorkspace(workspaceId, session.access_token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not generate contractor report.");
    } finally {
      setWorking(null);
    }
  }

  if (!supabase) {
    return <Gate title="Supabase is not configured." body="The browser client needs the public Supabase URL and publishable key." />;
  }

  if (loading) {
    return (
      <main className={styles.screen}>
        <div className={styles.loadingBox}>
          <Loader2 className={styles.spin} />
          <h1>Opening contractor metrics</h1>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <Gate
        title="Sign in first"
        body="Open the main app, sign in, then come back here. This page uses your existing Supabase session to manage contractor metrics integrations."
      />
    );
  }

  return (
    <main className={styles.screen}>
      <section className={styles.hero}>
        <span>Contractor Metrics</span>
        <h1>Connect GoHighLevel and JobTread, sync live rows, then generate reports.</h1>
        <p>
          This view now uses the app's secure connector flow instead of raw manual payloads. GoHighLevel feeds lead data, JobTread feeds job data, and both land in the normalized contractor reporting tables already inside Supabase.
        </p>
        <div className={styles.heroActions}>
          <Link href="/" className={styles.linkButton}>
            Back to library
          </Link>
          <button className={styles.ghost} onClick={() => refreshWorkspace()}>
            {working === "refresh" ? <Loader2 className={styles.spin} /> : <RefreshCw />}
            Refresh
          </button>
        </div>
      </section>

      {(notice || error) && <p className={error ? styles.error : styles.notice}>{error || notice}</p>}

      <section className={styles.kpis}>
        <MetricCard label="Connected accounts" value={String(accounts.length)} detail="Private Integration and API-based contractor sources saved server-side." />
        <MetricCard label="Normalized sources" value={String(sources.length)} detail="Provider sync sources inside contractor_data_sources." />
        <MetricCard label="Saved reports" value={String(reports.length)} detail="Generated snapshots in contractor_reports." />
        <MetricCard
          label="Latest revenue"
          value={money(latestReport?.totals?.revenue)}
          detail={latestReport ? `${latestReport.start_date} to ${latestReport.end_date}` : "Generate the first report after syncing data."}
        />
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <span>GoHighLevel</span>
            <Link2 />
          </div>
          <p className={styles.copy}>
            Connect GoHighLevel with a private integration token now, or use OAuth when this deployment has app-level GHL credentials configured.
          </p>
          <div className={styles.accountSummary}>
            <strong>
              {ghlStatus?.serviceRoleConfigured
                ? ghlStatus?.oauthConfigured
                  ? "OAuth and private integration are available."
                  : "Private integration is available. OAuth is not configured on this deployment."
                : "Server-side connector storage is not ready on this deployment."}
            </strong>
            <small>
              {ghlStatus?.serviceRoleConfigured
                ? ghlStatus?.oauthConfigured
                  ? `OAuth callback: ${ghlStatus.callbackUrl}`
                  : "Set GHL_CLIENT_ID and GHL_CLIENT_SECRET in Vercel to enable OAuth. Private integration still works."
                : "Set SUPABASE_SERVICE_ROLE_KEY in Vercel so the app can securely save connected accounts."}
            </small>
          </div>
          {ghlStatus?.oauthConfigured ? (
            <div className={styles.actionRow}>
              <button className={styles.secondary} type="button" disabled={Boolean(working) || !ghlStatus.serviceRoleConfigured} onClick={startGhlOauth}>
                {working === "start-ghl-oauth" ? <Loader2 className={styles.spin} /> : <ArrowUpRight />}
                Connect with OAuth
              </button>
            </div>
          ) : null}
          <form className={styles.formGrid} onSubmit={connectGhl}>
            <label className={styles.fullField}>
              <span>Account label</span>
              <input
                value={ghlDraft.accountLabel}
                onChange={(event) => setGhlDraft((current) => ({ ...current, accountLabel: event.target.value }))}
              />
            </label>
            <label>
              <span>Private Integration token</span>
              <input
                type="password"
                value={ghlDraft.privateIntegrationToken}
                onChange={(event) => setGhlDraft((current) => ({ ...current, privateIntegrationToken: event.target.value }))}
                placeholder="Paste GHL token"
                required
              />
            </label>
            <label>
              <span>Location ID</span>
              <input
                value={ghlDraft.locationId}
                onChange={(event) => setGhlDraft((current) => ({ ...current, locationId: event.target.value }))}
                placeholder="Required location ID"
                required
              />
            </label>
            <label>
              <span>External account ID</span>
              <input
                value={ghlDraft.externalAccountId}
                onChange={(event) => setGhlDraft((current) => ({ ...current, externalAccountId: event.target.value }))}
                placeholder="Optional stored account key"
              />
            </label>
            <label className={styles.fullField}>
              <span>API base URL</span>
              <input
                value={ghlDraft.apiBaseUrl}
                onChange={(event) => setGhlDraft((current) => ({ ...current, apiBaseUrl: event.target.value }))}
              />
            </label>
            <div className={styles.actionRow}>
              <button className={styles.primary} disabled={Boolean(working) || ghlStatus?.serviceRoleConfigured === false}>
                {working === "connect-ghl" ? <Loader2 className={styles.spin} /> : <Check />}
                {ghlAccount ? "Save GoHighLevel account" : "Connect GoHighLevel"}
              </button>
              {ghlAccount && (
                <button
                  className={styles.secondary}
                  type="button"
                  disabled={Boolean(working)}
                  onClick={() => syncAccount(ghlAccount)}
                >
                  {working === `sync-${ghlAccount.id}` ? <Loader2 className={styles.spin} /> : <RefreshCw />}
                  Sync leads
                </button>
              )}
            </div>
          </form>
          <div className={styles.accountSummary}>
            <strong>{ghlAccount?.accountLabel || "No account connected"}</strong>
            <small>{ghlAccount ? describeAccount(ghlAccount) : "Private integration token and location ID required."}</small>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <span>JobTread</span>
            <KeyRound />
          </div>
          <p className={styles.copy}>Store a JobTread API token server-side, then sync jobs into the contractor metrics tables.</p>
          <form className={styles.formGrid} onSubmit={connectJobTread}>
            <label className={styles.fullField}>
              <span>Account label</span>
              <input
                value={jobTreadDraft.accountLabel}
                onChange={(event) => setJobTreadDraft((current) => ({ ...current, accountLabel: event.target.value }))}
              />
            </label>
            <label>
              <span>API token</span>
              <input
                type="password"
                value={jobTreadDraft.apiToken}
                onChange={(event) => setJobTreadDraft((current) => ({ ...current, apiToken: event.target.value }))}
                placeholder="Paste JobTread token"
                required
              />
            </label>
            <label>
              <span>External account ID</span>
              <input
                value={jobTreadDraft.externalAccountId}
                onChange={(event) => setJobTreadDraft((current) => ({ ...current, externalAccountId: event.target.value }))}
                placeholder="Optional org/account key"
              />
            </label>
            <label className={styles.fullField}>
              <span>API base URL</span>
              <input
                value={jobTreadDraft.apiBaseUrl}
                onChange={(event) => setJobTreadDraft((current) => ({ ...current, apiBaseUrl: event.target.value }))}
              />
            </label>
            <button className={styles.primary} disabled={Boolean(working)}>
              {working === "connect-jobtread" ? <Loader2 className={styles.spin} /> : <Check />}
              Save JobTread account
            </button>
          </form>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <span>Connected accounts</span>
          <Database />
        </div>
        {accounts.length ? (
          <div className={styles.accountList}>
            {accounts.map((account) => (
              <article className={styles.accountCard} key={account.id}>
                <div className={styles.accountHeader}>
                  <div>
                    <strong>{account.accountLabel || providerLabel(account.provider)}</strong>
                    <small>{describeAccount(account)}</small>
                  </div>
                  <span className={styles.statusPill}>{account.status}</span>
                </div>
                <div className={styles.accountMeta}>
                  <span>{providerLabel(account.provider)}</span>
                  <span>{account.externalAccountId || "No external ID stored"}</span>
                  <span>{account.metadata?.authMode || "server credential"}</span>
                </div>
                <div className={styles.actionRow}>
                  <button className={styles.secondary} disabled={Boolean(working)} onClick={() => syncAccount(account)}>
                    {working === `sync-${account.id}` ? <Loader2 className={styles.spin} /> : <RefreshCw />}
                    Sync now
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>No contractor metrics accounts connected yet.</p>
        )}
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <span>Normalized data sources</span>
            <Database />
          </div>
          {sources.length ? (
            <div className={styles.reportList}>
              {sources.map((source) => (
                <div className={styles.reportRow} key={source.id}>
                  <strong>{source.display_name}</strong>
                  <small>{providerLabel(source.provider)} / {source.status}</small>
                  <span>{source.last_synced_at ? `Synced ${formatDateTime(source.last_synced_at)}` : "Never synced"}</span>
                  {source.last_error ? <small className={styles.rowError}>{source.last_error}</small> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No contractor sync sources yet.</p>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <span>Report builder</span>
            <BarChart3 />
          </div>
          <div className={styles.formGrid}>
            <label className={styles.fullField}>
              <span>Client name</span>
              <input value={clientName} onChange={(event) => setClientName(event.target.value)} />
            </label>
            <label>
              <span>Start date</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>
              <span>End date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
          <div className={styles.actionRow}>
            <button className={styles.primary} disabled={Boolean(working)} onClick={generateReport}>
              {working === "report" ? <Loader2 className={styles.spin} /> : <BarChart3 />}
              Generate report
            </button>
          </div>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <span>Latest generated report</span>
            <BarChart3 />
          </div>
          {latestReport ? (
            <div className={styles.reportSummary}>
              <MetricCard label="Spend" value={money(latestReport.totals?.spend)} detail="Tracked spend rows in range." />
              <MetricCard label="Revenue" value={money(latestReport.totals?.revenue)} detail="Sold revenue in range." />
              <MetricCard label="ROAS" value={ratio(latestReport.totals?.roas)} detail="Revenue divided by tracked spend." />
              <MetricCard label="Close rate" value={percent(latestReport.totals?.closeRate)} detail="Sold jobs divided by qualified leads." />
            </div>
          ) : (
            <p className={styles.empty}>Generate a report after syncing one or more sources.</p>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <span>Recent saved reports</span>
            <Check />
          </div>
          {reports.length ? (
            <div className={styles.reportList}>
              {reports.map((report) => (
                <div className={styles.reportRow} key={report.id}>
                  <strong>{report.client_name || "Contractor report"}</strong>
                  <small>
                    {report.start_date} to {report.end_date}
                  </small>
                  <span>{money(report.totals?.revenue)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No saved contractor reports yet.</p>
          )}
        </article>
      </section>
    </main>
  );
}

function Gate({ title, body }: { title: string; body: string }) {
  return (
    <main className={styles.screen}>
      <section className={styles.hero}>
        <span>Contractor Metrics</span>
        <h1>{title}</h1>
        <p>{body}</p>
        <div className={styles.heroActions}>
          <Link href="/" className={styles.linkButton}>
            Open main app
          </Link>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className={styles.metricCard}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function providerLabel(provider: string) {
  if (provider === "ghl" || provider === "gohighlevel") return "GoHighLevel";
  if (provider === "jobtread") return "JobTread";
  return provider;
}

function describeAccount(account: ConnectedAccountRow) {
  const parts = [account.metadata?.authMode, account.metadata?.locationId, account.expiresAt ? `expires ${formatDateTime(account.expiresAt)}` : null]
    .filter(Boolean)
    .map(String);
  return parts.join(" / ") || "Ready to sync";
}

function money(value: unknown) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "$0";
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function ratio(value: unknown) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "0x";
  return `${amount.toFixed(2)}x`;
}

function percent(value: unknown) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "0%";
  return `${Math.round(amount * 100)}%`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function readConnectSuccess(value: string) {
  if (value === "ghl") return "GoHighLevel OAuth connected. You can sync leads now.";
  return "Connection saved.";
}

function readConnectError(value: string) {
  const normalized = decodeURIComponent(value);
  const labels: Record<string, string> = {
    missing_ghl_oauth_code: "GoHighLevel did not return an authorization code.",
    invalid_oauth_state: "The GoHighLevel connection expired or no longer matches this session. Start the connection again.",
    expired_oauth_state: "The GoHighLevel connection expired before it was completed. Start the connection again.",
    ghl_oauth_env_missing: "GoHighLevel OAuth is not fully configured in Vercel yet.",
    supabase_service_role_missing: "SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel.",
  };
  return labels[normalized] ?? normalized;
}
