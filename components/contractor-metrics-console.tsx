"use client";

import Link from "next/link";
import { BarChart3, Database, Link2, Loader2, RefreshCw, Save, Settings2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "./contractor-metrics-console.module.css";

type ConnectedAccountRow = {
  id: string;
  provider: string;
  accountLabel: string | null;
  status: string;
  expiresAt: string | null;
  metadata: Record<string, any> | null;
};

type ContractorSourceRow = {
  id: string;
  provider: string;
  display_name: string;
  status: string;
  last_synced_at: string | null;
  last_error: string | null;
  updated_at: string | null;
};

type ReportRow = {
  id: string;
  client_name: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
  totals: Record<string, any> | null;
  breakdowns: Record<string, any> | null;
  detail: Record<string, any> | null;
  source_snapshot: Record<string, any> | null;
  rule_set_id?: string | null;
};

type RuleSet = {
  id?: string;
  name: string;
  slug: string;
  version: number;
  description: string;
  isDefault: boolean;
  status: "active" | "draft" | "archived";
  providers: any[];
  globalFilters: any[];
  classifications: Record<string, any>;
  metricDefinitions: any[];
  groupedMetricSets: any[];
  settings: Record<string, any>;
};

type ConfigResponse = {
  ruleSets: RuleSet[];
  currentRuleSet: RuleSet | null;
};

type ReportPreview = {
  reportId: string;
  createdAt: string;
  totals: Record<string, any>;
  breakdowns: Record<string, any>;
  executiveSummary: string[];
  configuredMetrics?: Array<{ id: string; name: string; value: number | string | null; displayType: string; formula?: string | null }>;
  unmatched?: { leads?: any[]; jobs?: any[] };
};

type GhlDraft = {
  accountLabel: string;
  privateIntegrationToken: string;
  locationId: string;
  externalAccountId: string;
  apiBaseUrl: string;
};

type JobTreadDraft = {
  accountLabel: string;
  apiToken: string;
  externalAccountId: string;
  apiBaseUrl: string;
};

const emptyGhlDraft: GhlDraft = {
  accountLabel: "GoHighLevel",
  privateIntegrationToken: "",
  locationId: "",
  externalAccountId: "",
  apiBaseUrl: "https://services.leadconnectorhq.com",
};

const emptyJobTreadDraft: JobTreadDraft = {
  accountLabel: "JobTread",
  apiToken: "",
  externalAccountId: "",
  apiBaseUrl: "https://api.jobtread.com",
};

const tabs = [
  { id: "connections", label: "Connections", icon: Link2 },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "builder", label: "Metric Builder", icon: Settings2 },
] as const;

export function ContractorMetricsConsole() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("reports");
  const [accounts, setAccounts] = useState<ConnectedAccountRow[]>([]);
  const [sources, setSources] = useState<ContractorSourceRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [selectedRuleSetId, setSelectedRuleSetId] = useState<string | null>(null);
  const [ruleSetDraft, setRuleSetDraft] = useState<RuleSet | null>(null);
  const [latestPreview, setLatestPreview] = useState<ReportPreview | null>(null);
  const [clientName, setClientName] = useState("Trust Compression Contractor Report");
  const [startDate, setStartDate] = useState("2026-06-01");
  const [endDate, setEndDate] = useState("2026-06-30");
  const [ghlDraft, setGhlDraft] = useState<GhlDraft>(emptyGhlDraft);
  const [jobTreadDraft, setJobTreadDraft] = useState<JobTreadDraft>(emptyJobTreadDraft);

  const activeReport = latestPreview ?? reportRowToPreview(reports[0] ?? null);

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
    if (!selectedRuleSetId) return;
    const nextRuleSet = ruleSets.find((entry) => entry.id === selectedRuleSetId) ?? null;
    if (nextRuleSet) setRuleSetDraft(clone(nextRuleSet));
  }, [selectedRuleSetId, ruleSets]);

  async function refreshWorkspace(nextWorkspaceId = workspaceId, accessToken = session?.access_token) {
    if (!supabase || !nextWorkspaceId || !accessToken) return;

    setWorking((current) => current ?? "refresh");
    setError("");

    const [accountsResponse, configResponse, reportRows, sourceRows] = await Promise.all([
      fetch(`/api/connect/accounts?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch(`/api/metrics/contractor/config?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      supabase
        .from("contractor_reports")
        .select("id,client_name,start_date,end_date,created_at,totals,breakdowns,detail,source_snapshot,rule_set_id")
        .eq("workspace_id", nextWorkspaceId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("contractor_data_sources")
        .select("id,provider,display_name,status,last_synced_at,last_error,updated_at")
        .eq("workspace_id", nextWorkspaceId)
        .order("updated_at", { ascending: false }),
    ]);

    const accountsJson = (await accountsResponse.json().catch(() => ({}))) as { accounts?: ConnectedAccountRow[]; error?: string };
    const configJson = (await configResponse.json().catch(() => ({}))) as ConfigResponse & { error?: string };

    if (!accountsResponse.ok) setError(accountsJson.error ?? "Could not load secure connected accounts.");
    if (!configResponse.ok) setError(configJson.error ?? "Could not load contractor metric rule sets.");

    setAccounts(accountsJson.accounts ?? []);
    setSources((reportRows.error ? [] : sourceRows.data ?? []) as ContractorSourceRow[]);
    setReports((reportRows.data ?? []) as ReportRow[]);
    setRuleSets(configJson.ruleSets ?? []);

    const currentRuleSet = configJson.currentRuleSet ?? configJson.ruleSets?.[0] ?? null;
    setSelectedRuleSetId((current) => current ?? currentRuleSet?.id ?? null);
    setRuleSetDraft((current) => current ?? clone(currentRuleSet));
    setWorking(null);
  }

  async function postAction(url: string, state: string, body: Record<string, any>) {
    if (!workspaceId || !session) return;
    setWorking(state);
    setNotice("");
    setError("");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; imported?: number; updated?: number; skipped?: number };
      if (!response.ok) throw new Error(result.error ?? "Request failed.");
      if (state.startsWith("sync-")) {
        setNotice(`Sync complete. Imported ${result.imported ?? 0}, updated ${result.updated ?? 0}, skipped ${result.skipped ?? 0}.`);
      } else {
        setNotice("Saved successfully.");
      }
      await refreshWorkspace(workspaceId, session.access_token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Request failed.");
    } finally {
      setWorking(null);
    }
  }

  async function connectGhl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await postAction("/api/connect/ghl", "connect-ghl", {
      workspaceId,
      accountLabel: ghlDraft.accountLabel,
      privateIntegrationToken: ghlDraft.privateIntegrationToken,
      locationId: ghlDraft.locationId,
      externalAccountId: ghlDraft.externalAccountId || undefined,
      apiBaseUrl: ghlDraft.apiBaseUrl,
    });
    setGhlDraft((current) => ({ ...current, privateIntegrationToken: "" }));
  }

  async function connectJobTread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await postAction("/api/connect/jobtread", "connect-jobtread", {
      workspaceId,
      accountLabel: jobTreadDraft.accountLabel,
      apiToken: jobTreadDraft.apiToken,
      externalAccountId: jobTreadDraft.externalAccountId || undefined,
      apiBaseUrl: jobTreadDraft.apiBaseUrl,
    });
    setJobTreadDraft((current) => ({ ...current, apiToken: "" }));
  }

  async function runReport() {
    if (!workspaceId || !session || !ruleSetDraft) return;
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
        body: JSON.stringify({
          workspaceId,
          startDate,
          endDate,
          clientName,
          ruleSetId: ruleSetDraft.id,
        }),
      });
      const result = (await response.json()) as ReportPreview & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not generate contractor report.");
      setLatestPreview(result);
      setNotice("Report generated from the selected rule set snapshot.");
      await refreshWorkspace(workspaceId, session.access_token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not generate contractor report.");
    } finally {
      setWorking(null);
    }
  }

  async function saveRuleSet() {
    if (!workspaceId || !session || !ruleSetDraft) return;
    setWorking("save-rule-set");
    setNotice("");
    setError("");

    try {
      const isExisting = Boolean(ruleSetDraft.id);
      const response = await fetch(
        isExisting ? `/api/metrics/contractor/config/${ruleSetDraft.id}` : "/api/metrics/contractor/config",
        {
          method: isExisting ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ workspaceId, ruleSet: ruleSetDraft }),
        }
      );
      const result = (await response.json()) as { ruleSet?: RuleSet; error?: string };
      if (!response.ok || !result.ruleSet) throw new Error(result.error ?? "Could not save contractor rule set.");
      setRuleSetDraft(clone(result.ruleSet));
      setSelectedRuleSetId(result.ruleSet.id ?? null);
      setNotice("Rule set saved.");
      await refreshWorkspace(workspaceId, session.access_token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not save contractor rule set.");
    } finally {
      setWorking(null);
    }
  }

  function duplicateRuleSet() {
    if (!ruleSetDraft) return;
    const nextRuleSet = clone(ruleSetDraft);
    nextRuleSet.id = undefined;
    nextRuleSet.isDefault = false;
    nextRuleSet.name = `${nextRuleSet.name} Copy`;
    nextRuleSet.slug = slugify(nextRuleSet.name);
    setSelectedRuleSetId(null);
    setRuleSetDraft(nextRuleSet);
  }

  if (loading) {
    return (
      <main className={styles.screen}>
        <div className={styles.loadingBox}>
          <Loader2 className={styles.spin} />
          <p className={styles.copy}>Opening the contractor metrics workspace.</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return <Gate title="Sign in required" body="Use the main Trust Compression sign-in flow, then return to the contractor metrics workspace." />;
  }

  if (!workspaceId) {
    return <Gate title="Workspace unavailable" body="The contractor metrics workspace could not be opened for this account." />;
  }

  return (
    <main className={styles.screen}>
      <section className={styles.hero}>
        <span>Contractor Metrics</span>
        <h1>Rule-based reporting for GoHighLevel and JobTread.</h1>
        <p>
          Connect provider accounts, sync normalized contractor rows, run reports, and edit persisted rule sets directly in the app. Each run now snapshots the active metric rules.
        </p>
      </section>

      {notice ? <div className={styles.notice}>{notice}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.shellTabs}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button key={tab.id} className={active ? styles.shellTabActive : styles.shellTab} type="button" onClick={() => setActiveTab(tab.id)}>
              <Icon />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "connections" ? (
        <>
          <section className={styles.grid}>
            <Panel title="GoHighLevel private integration" icon={<Link2 />}>
              <p className={styles.copy}>Save a location-scoped private integration token server-side, then sync leads into the contractor tables.</p>
              <form className={styles.formGrid} onSubmit={connectGhl}>
                <Field label="Account label" value={ghlDraft.accountLabel} onChange={(value) => setGhlDraft((current) => ({ ...current, accountLabel: value }))} />
                <Field label="Location ID" value={ghlDraft.locationId} onChange={(value) => setGhlDraft((current) => ({ ...current, locationId: value }))} />
                <Field label="External account ID" value={ghlDraft.externalAccountId} onChange={(value) => setGhlDraft((current) => ({ ...current, externalAccountId: value }))} />
                <Field label="API base URL" value={ghlDraft.apiBaseUrl} onChange={(value) => setGhlDraft((current) => ({ ...current, apiBaseUrl: value }))} />
                <PasswordField label="Private integration token" value={ghlDraft.privateIntegrationToken} onChange={(value) => setGhlDraft((current) => ({ ...current, privateIntegrationToken: value }))} />
                <button className={styles.primary} type="submit" disabled={working === "connect-ghl"}>
                  <Save />
                  Save GoHighLevel account
                </button>
              </form>
            </Panel>

            <Panel title="JobTread API token" icon={<Database />}>
              <p className={styles.copy}>Store a JobTread API token server-side, then sync jobs into the same reporting workspace.</p>
              <form className={styles.formGrid} onSubmit={connectJobTread}>
                <Field label="Account label" value={jobTreadDraft.accountLabel} onChange={(value) => setJobTreadDraft((current) => ({ ...current, accountLabel: value }))} />
                <Field label="External account ID" value={jobTreadDraft.externalAccountId} onChange={(value) => setJobTreadDraft((current) => ({ ...current, externalAccountId: value }))} />
                <Field label="API base URL" value={jobTreadDraft.apiBaseUrl} onChange={(value) => setJobTreadDraft((current) => ({ ...current, apiBaseUrl: value }))} />
                <PasswordField label="API token" value={jobTreadDraft.apiToken} onChange={(value) => setJobTreadDraft((current) => ({ ...current, apiToken: value }))} />
                <button className={styles.primary} type="submit" disabled={working === "connect-jobtread"}>
                  <Save />
                  Save JobTread account
                </button>
              </form>
            </Panel>
          </section>

          <section className={styles.grid}>
            <Panel title={`Connected accounts (${accounts.length})`} icon={<Link2 />}>
              <div className={styles.accountList}>
                {accounts.length ? (
                  accounts.map((account) => (
                    <article key={account.id} className={styles.accountCard}>
                      <div className={styles.accountHeader}>
                        <div className={styles.accountSummary}>
                          <strong>{account.accountLabel || providerLabel(account.provider)}</strong>
                          <small>{providerLabel(account.provider)}</small>
                        </div>
                        <div className={styles.accountMeta}>
                          <span>{account.status}</span>
                          {account.expiresAt ? <span>Expires {formatDateTime(account.expiresAt)}</span> : null}
                        </div>
                      </div>
                      <p className={styles.copy}>{describeAccount(account)}</p>
                      <div className={styles.actionRow}>
                        <button className={styles.secondary} type="button" disabled={working === `sync-${account.id}`} onClick={() => postAction("/api/metrics/contractor/sync", `sync-${account.id}`, { workspaceId, connectedAccountId: account.id })}>
                          <RefreshCw />
                          Sync now
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className={styles.empty}>No connected accounts yet.</p>
                )}
              </div>
            </Panel>

            <Panel title={`Normalized sources (${sources.length})`} icon={<Database />}>
              <div className={styles.reportList}>
                {sources.length ? (
                  sources.map((source) => (
                    <article key={source.id} className={styles.reportRow}>
                      <strong>{source.display_name}</strong>
                      <small>{providerLabel(source.provider)} / {source.status}</small>
                      <small>Last synced {formatDateTime(source.last_synced_at || source.updated_at)}</small>
                      {source.last_error ? <small className={styles.rowError}>{source.last_error}</small> : null}
                    </article>
                  ))
                ) : (
                  <p className={styles.empty}>No normalized sources yet. Connect an account and run a sync.</p>
                )}
              </div>
            </Panel>
          </section>
        </>
      ) : null}

      {activeTab === "reports" ? (
        <>
          <section className={styles.grid}>
            <Panel title="Run report" icon={<BarChart3 />}>
              <div className={styles.formGrid}>
                <Field label="Client name" value={clientName} onChange={setClientName} />
                <SelectField label="Rule set" value={selectedRuleSetId ?? ""} onChange={(value) => setSelectedRuleSetId(value || null)} options={ruleSets.map((ruleSet) => ({ value: ruleSet.id ?? "", label: `${ruleSet.name}${ruleSet.isDefault ? " (default)" : ""}` }))} />
                <Field label="Start date" type="date" value={startDate} onChange={setStartDate} />
                <Field label="End date" type="date" value={endDate} onChange={setEndDate} />
                <button className={styles.primary} type="button" disabled={working === "report" || !ruleSetDraft} onClick={runReport}>
                  <BarChart3 />
                  Generate report
                </button>
              </div>
            </Panel>

            <Panel title={`Saved runs (${reports.length})`} icon={<Database />}>
              <div className={styles.reportList}>
                {reports.length ? (
                  reports.map((report) => (
                    <article key={report.id} className={styles.reportRow}>
                      <strong>{report.client_name || "Contractor Report"}</strong>
                      <small>{report.start_date} to {report.end_date}</small>
                      <small>Generated {formatDateTime(report.created_at)}</small>
                      <div className={styles.actionRow}>
                        <button className={styles.ghost} type="button" onClick={() => setLatestPreview(reportRowToPreview(report))}>
                          View snapshot
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className={styles.empty}>No report runs yet.</p>
                )}
              </div>
            </Panel>
          </section>

          {activeReport ? (
            <>
              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <span>Topline</span>
                  <BarChart3 />
                </div>
                <div className={styles.metricGrid}>
                  <MetricCard label="Leads" value={numberValue(activeReport.totals?.leads)} detail="Normalized lead rows in-range." />
                  <MetricCard label="Appointments" value={numberValue(activeReport.totals?.issuedLeads)} detail="Appointments from JobTread rows." />
                  <MetricCard label="Sold Jobs" value={numberValue(activeReport.totals?.soldJobs)} detail="Sold jobs after rule evaluation." />
                  <MetricCard label="Revenue" value={money(activeReport.totals?.revenue)} detail="Attributed contract value." />
                  <MetricCard label="Paid Spend" value={money(activeReport.totals?.spend)} detail="Imported marketing spend rows." />
                  <MetricCard label="ROAS" value={ratio(activeReport.totals?.roas)} detail="Paid revenue divided by spend." />
                  <MetricCard label="Close Rate" value={percent(activeReport.totals?.closeRate)} detail="Sold jobs divided by appointments." />
                  <MetricCard label="Avg Time To Close" value={days(activeReport.totals?.averageTimeToCloseDays)} detail="Average days from lead to sold." />
                </div>
              </section>

              <section className={styles.grid}>
                <Panel title="Configured metrics" icon={<Settings2 />}>
                  <div className={styles.summaryList}>
                    {(activeReport.configuredMetrics ?? []).length ? (
                      activeReport.configuredMetrics?.map((metric) => (
                        <div key={metric.id} className={styles.metricCard}>
                          <span>{metric.name}</span>
                          <strong>{formatMetricValue(metric.value, metric.displayType)}</strong>
                          <small>{metric.formula || metric.id}</small>
                        </div>
                      ))
                    ) : (
                      <p className={styles.empty}>This run does not include configured metrics yet.</p>
                    )}
                  </div>
                </Panel>

                <Panel title="Executive summary" icon={<Database />}>
                  <div className={styles.summaryList}>
                    {(activeReport.executiveSummary ?? []).length ? (
                      activeReport.executiveSummary.map((line, index) => <p key={`${line}-${index}`} className={styles.copy}>{line}</p>)
                    ) : (
                      <p className={styles.empty}>No executive summary lines yet.</p>
                    )}
                  </div>
                </Panel>
              </section>
            </>
          ) : null}
        </>
      ) : null}

      {activeTab === "builder" ? (
        <section className={styles.stack}>
          <section className={styles.panel}>
            <div className={styles.builderHeader}>
              <div>
                <span>Rule Sets</span>
                <h2>Persisted metric definitions</h2>
                <p className={styles.copy}>This builder writes directly to contractor metric rule sets, and report runs now snapshot the active rules.</p>
              </div>
              <div className={styles.actionRow}>
                <button className={styles.secondary} type="button" onClick={duplicateRuleSet}>
                  <Save />
                  Duplicate
                </button>
                <button className={styles.primary} type="button" disabled={working === "save-rule-set" || !ruleSetDraft} onClick={saveRuleSet}>
                  <Save />
                  Save rule set
                </button>
              </div>
            </div>
            <div className={styles.formGrid}>
              <SelectField label="Loaded rule set" value={selectedRuleSetId ?? ""} onChange={(value) => setSelectedRuleSetId(value || null)} options={ruleSets.map((ruleSet) => ({ value: ruleSet.id ?? "", label: `${ruleSet.name}${ruleSet.isDefault ? " (default)" : ""}` }))} />
              <Field label="Name" value={ruleSetDraft?.name ?? ""} onChange={(value) => setRuleSetDraft((current) => current ? { ...current, name: value, slug: slugify(value) } : current)} />
              <Field label="Slug" value={ruleSetDraft?.slug ?? ""} onChange={(value) => setRuleSetDraft((current) => current ? { ...current, slug: slugify(value) } : current)} />
              <SelectField label="Status" value={ruleSetDraft?.status ?? "active"} onChange={(value) => setRuleSetDraft((current) => current ? { ...current, status: value as RuleSet["status"] } : current)} options={[{ value: "active", label: "active" }, { value: "draft", label: "draft" }, { value: "archived", label: "archived" }]} />
              <Field label="Version" type="number" value={String(ruleSetDraft?.version ?? 1)} onChange={(value) => setRuleSetDraft((current) => current ? { ...current, version: Number(value || 1) } : current)} />
              <SelectField label="Default" value={ruleSetDraft?.isDefault ? "true" : "false"} onChange={(value) => setRuleSetDraft((current) => current ? { ...current, isDefault: value === "true" } : current)} options={[{ value: "false", label: "No" }, { value: "true", label: "Yes" }]} />
              <TextAreaField label="Description" value={ruleSetDraft?.description ?? ""} onChange={(value) => setRuleSetDraft((current) => current ? { ...current, description: value } : current)} />
            </div>
          </section>

          {ruleSetDraft ? (
            <>
              <JsonPanel title="Providers" value={ruleSetDraft.providers} onSave={(value) => setRuleSetDraft((current) => current ? { ...current, providers: value } : current)} />
              <JsonPanel title="Global filters" value={ruleSetDraft.globalFilters} onSave={(value) => setRuleSetDraft((current) => current ? { ...current, globalFilters: value } : current)} />
              <JsonPanel title="Classifications" value={ruleSetDraft.classifications} onSave={(value) => setRuleSetDraft((current) => current ? { ...current, classifications: value } : current)} />
              <JsonPanel title="Metric definitions" value={ruleSetDraft.metricDefinitions} onSave={(value) => setRuleSetDraft((current) => current ? { ...current, metricDefinitions: value } : current)} />
              <JsonPanel title="Grouped metric sets" value={ruleSetDraft.groupedMetricSets} onSave={(value) => setRuleSetDraft((current) => current ? { ...current, groupedMetricSets: value } : current)} />
              <JsonPanel title="Settings" value={ruleSetDraft.settings} onSave={(value) => setRuleSetDraft((current) => current ? { ...current, settings: value } : current)} />
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <span>{title}</span>
        {icon}
      </div>
      {children}
    </section>
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

function JsonPanel({ title, value, onSave }: { title: string; value: any; onSave: (value: any) => void }) {
  const [draft, setDraft] = useState(() => prettyJson(value));
  const [parseError, setParseError] = useState("");

  useEffect(() => {
    setDraft(prettyJson(value));
    setParseError("");
  }, [value]);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <span>{title}</span>
        <Settings2 />
      </div>
      <div className={styles.formGrid}>
        <label className={styles.fullField}>
          <span>JSON editor</span>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
        </label>
        {parseError ? <p className={styles.rowError}>{parseError}</p> : null}
        <button
          className={styles.secondary}
          type="button"
          onClick={() => {
            try {
              onSave(JSON.parse(draft));
              setParseError("");
            } catch (nextError) {
              setParseError(nextError instanceof Error ? nextError.message : "Invalid JSON.");
            }
          }}
        >
          <Save />
          Apply JSON
        </button>
      </div>
    </section>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label>
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function PasswordField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label} type="password" value={value} onChange={onChange} />;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className={styles.fullField}>
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function reportRowToPreview(report: ReportRow | null): ReportPreview | null {
  if (!report) return null;
  return {
    reportId: report.id,
    createdAt: report.created_at,
    totals: report.totals ?? {},
    breakdowns: report.breakdowns ?? {},
    executiveSummary: report.detail?.executiveSummary ?? [],
    configuredMetrics: report.detail?.configuredMetrics ?? [],
    unmatched: report.detail?.unmatched ?? {},
  };
}

function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function prettyJson(value: any) {
  return JSON.stringify(value ?? {}, null, 2);
}

function slugify(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function providerLabel(provider: string) {
  if (provider === "ghl" || provider === "gohighlevel") return "GoHighLevel";
  if (provider === "jobtread") return "JobTread";
  if (provider === "spend") return "Spend";
  if (provider === "combined") return "Combined";
  return provider;
}

function describeAccount(account: ConnectedAccountRow) {
  const parts = [account.metadata?.authMode, account.metadata?.locationId, account.metadata?.companyId, account.metadata?.readonly ? "Readonly" : null]
    .filter(Boolean)
    .map(String);
  return parts.join(" / ") || "Ready to sync";
}

function formatMetricValue(value: unknown, displayType: string) {
  if (displayType === "currency") return money(value);
  if (displayType === "percent") return percent(value);
  if (displayType === "ratio") return ratio(value);
  if (displayType === "days") return days(value);
  if (displayType === "number") return numberValue(value);
  return String(value ?? "N/A");
}

function numberValue(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toLocaleString("en-US") : "0";
}

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "$0";
}

function ratio(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? `${amount.toFixed(2)}x` : "0x";
}

function percent(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? `${Math.round(amount * 100)}%` : "0%";
}

function days(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? `${amount.toFixed(1)} days` : "0 days";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "N/A";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
