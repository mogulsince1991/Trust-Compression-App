"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, BarChart3, Database, Info, Link2, Loader2, Plus, RefreshCw, Save, Settings2, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "./contractor-metrics-console.module.css";

type AnyRecord = Record<string, any>;
type TabId = "metrics" | "config" | "connections";
type SourcePreview = {
  connectedAccountId: string;
  accountLabel?: string | null;
  provider: string;
  fetchedAt: string;
  totalRows: number;
  columns: Array<{ key: string; label: string }>;
  rows: AnyRecord[];
  filters: Array<{ key: string; label: string; options: string[] }>;
  fieldCatalog: string[];
};
type PreviewFilterState = Record<string, string>;
type PreviewRequestState = {
  limit: string;
  startDate: string;
  endDate: string;
};
type FieldCatalog = Record<string, { label?: string; objects?: Record<string, string[]> }>;

const TABS: Array<{ id: TabId; label: string; icon: any }> = [
  { id: "metrics", label: "Metrics", icon: BarChart3 },
  { id: "config", label: "Report Config", icon: Settings2 },
  { id: "connections", label: "Connections", icon: Link2 },
];

const EMPTY_GHL = {
  accountLabel: "GoHighLevel",
  privateIntegrationToken: "",
  locationId: "",
  externalAccountId: "",
  apiBaseUrl: "https://services.leadconnectorhq.com",
};

const EMPTY_JOBTREAD = {
  accountLabel: "JobTread",
  apiToken: "",
  externalAccountId: "",
  apiBaseUrl: "https://api.jobtread.com",
};

const METRIC_OPERATIONS = ["count", "sum", "average", "formula"] as const;
const DISPLAY_TYPES = ["currency", "percent", "number", "ratio", "days", "string"] as const;
const CONDITION_OPERATORS = ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "exists", "not_exists", "between", "greater_than", "less_than", "regex"] as const;
const TABLE_OPTIONS = [
  { value: "paid_channel_performance", label: "Paid Channel Performance" },
  { value: "design_consultant_performance", label: "Design Consultant Performance" },
  { value: "leads_by_source", label: "Leads by Source" },
  { value: "jobs_sold_detail", label: "Jobs Sold Detail" },
  { value: "closing_outcomes", label: "Why Jobs Aren't Closing" },
  { value: "unmatched_review", label: "Unmatched / Review Rows" },
];

export function ContractorMetricsWorkspace() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>("connections");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [ruleSets, setRuleSets] = useState<any[]>([]);
  const [ruleSetDraft, setRuleSetDraft] = useState<any | null>(null);
  const [fieldCatalog, setFieldCatalog] = useState<FieldCatalog>({});
  const [selectedRuleSetId, setSelectedRuleSetId] = useState<string | null>(null);
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [previews, setPreviews] = useState<Record<string, SourcePreview>>({});
  const [previewFilters, setPreviewFilters] = useState<Record<string, PreviewFilterState>>({});
  const [previewRequests, setPreviewRequests] = useState<Record<string, PreviewRequestState>>({});
  const [clientName, setClientName] = useState("Trust Compression Contractor Report");
  const [startDate, setStartDate] = useState("2026-06-01");
  const [endDate, setEndDate] = useState("2026-06-30");
  const [ghl, setGhl] = useState(EMPTY_GHL);
  const [jobtread, setJobtread] = useState(EMPTY_JOBTREAD);

  const activeReport = preview;
  const metricMap = Object.fromEntries((activeReport?.configuredMetrics ?? []).map((metric: any) => [metric.id, metric]));
  const comparisonMap = Object.fromEntries((activeReport?.comparison?.configuredMetrics ?? []).map((metric: any) => [metric.id, metric]));
  const sections = normalizeSections(ruleSetDraft?.settings?.dashboardSections);
  const metrics = ruleSetDraft?.metricDefinitions ?? [];
  const selectedMetric = metrics.find((metric: any) => metric.id === selectedMetricId) ?? metrics[0] ?? null;
  const selectedMetricFields = selectedMetric ? getFieldOptions(fieldCatalog, selectedMetric.provider, selectedMetric.object) : [];

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    async function boot() {
      setLoading(true);
      const { data, error: workspaceError } = await supabase.rpc("ensure_workspace", { workspace_name: "Trust Library" });
      if (!active) return;
      if (workspaceError || !data) {
        setError(workspaceError?.message ?? "Could not open the workspace.");
        setLoading(false);
        return;
      }
      setWorkspaceId(data);
      await refresh(data, session.access_token);
      if (active) setLoading(false);
    }
    void boot();
    return () => {
      active = false;
    };
  }, [session, supabase]);

  useEffect(() => {
    if (!selectedRuleSetId) return;
    const next = ruleSets.find((entry) => entry.id === selectedRuleSetId) ?? null;
    if (next) setRuleSetDraft(clone(next));
  }, [selectedRuleSetId, ruleSets]);

  useEffect(() => {
    if (!metrics.length) {
      setSelectedMetricId(null);
      return;
    }
    setSelectedMetricId((current) => (current && metrics.some((metric: any) => metric.id === current) ? current : metrics[0].id));
  }, [metrics]);

  async function refresh(nextWorkspaceId = workspaceId, token = session?.access_token) {
    if (!nextWorkspaceId || !token) return;
    setWorking((current) => current || "refresh");
    const [accountsResponse, configResponse, reportRows, sourceRows] = await Promise.all([
      fetch(`/api/connect/accounts?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/metrics/contractor/config?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, { headers: { Authorization: `Bearer ${token}` } }),
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

    const accountsJson = await accountsResponse.json().catch(() => ({}));
    const configJson = await configResponse.json().catch(() => ({}));
    setAccounts(accountsJson.accounts ?? []);
    setSources(sourceRows.data ?? []);
    setReports(reportRows.data ?? []);
    setFieldCatalog(configJson.fieldCatalog ?? {});
    setRuleSets(configJson.ruleSets ?? []);
    const currentRuleSet = configJson.currentRuleSet ?? configJson.ruleSets?.[0] ?? null;
    setSelectedRuleSetId((current) => current ?? currentRuleSet?.id ?? null);
    setRuleSetDraft((current) => current ?? clone(currentRuleSet));
    setWorking("");
  }

  async function postAction(url: string, state: string, body: AnyRecord) {
    if (!workspaceId || !session) return;
    setWorking(state);
    setNotice("");
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Request failed.");
      setNotice(
        state.startsWith("sync-")
          ? `Cache sync complete. Imported ${result.imported ?? 0}, updated ${result.updated ?? 0}, skipped ${result.skipped ?? 0}.`
          : "Saved successfully."
      );
      await refresh(workspaceId, session.access_token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Request failed.");
    } finally {
      setWorking("");
    }
  }

  async function runReport() {
    if (!workspaceId || !session || !ruleSetDraft) return;
    setWorking("report");
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/metrics/contractor/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          workspaceId,
          startDate,
          endDate,
          clientName,
          ruleSetId: ruleSetDraft.id,
          compareToPreviousPeriod: (ruleSetDraft.settings?.comparisonMode ?? "previous_period") === "previous_period",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not generate contractor report.");
      setPreview({ ...result, ruleSet: ruleSetDraft });
      setNotice("Contractor report generated.");
      setTab("metrics");
      await refresh(workspaceId, session.access_token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not generate contractor report.");
    } finally {
      setWorking("");
    }
  }

  async function saveRuleSet() {
    if (!workspaceId || !session || !ruleSetDraft?.id) return;
    setWorking("save-rule-set");
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/metrics/contractor/config/${ruleSetDraft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ workspaceId, ruleSet: ruleSetDraft }),
      });
      const result = await response.json();
      if (!response.ok || !result.ruleSet) throw new Error(result.error ?? "Could not save contractor report config.");
      setRuleSetDraft(clone(result.ruleSet));
      setNotice("Workspace report config saved.");
      await refresh(workspaceId, session.access_token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not save contractor report config.");
    } finally {
      setWorking("");
    }
  }

  async function loadPreview(connectedAccountId: string) {
    if (!workspaceId || !session) return;
    const requestState = previewRequests[connectedAccountId] ?? defaultPreviewRequest();
    setWorking(`preview-${connectedAccountId}`);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/metrics/contractor/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          workspaceId,
          connectedAccountId,
          limit: clampPositiveInteger(requestState.limit, 100),
          startDate: requestState.startDate || undefined,
          endDate: requestState.endDate || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not preview source rows.");
      setPreviews((current) => ({ ...current, [connectedAccountId]: result }));
      setPreviewFilters((current) => ({
        ...current,
        [connectedAccountId]: current[connectedAccountId] ?? defaultPreviewFilters(result.filters),
      }));
      setNotice(`Loaded ${result.totalRows ?? 0} source rows for preview.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not preview source rows.");
    } finally {
      setWorking("");
    }
  }

  function updatePreviewRequest(connectedAccountId: string, key: keyof PreviewRequestState, value: string) {
    setPreviewRequests((current) => ({
      ...current,
      [connectedAccountId]: { ...(current[connectedAccountId] ?? defaultPreviewRequest()), [key]: value },
    }));
  }

  function updatePreviewFilter(connectedAccountId: string, key: string, value: string) {
    setPreviewFilters((current) => ({
      ...current,
      [connectedAccountId]: { ...(current[connectedAccountId] ?? {}), [key]: value },
    }));
  }

  function updateRuleSet(mutator: (current: any) => any) {
    setRuleSetDraft((current: any) => (current ? mutator(clone(current)) : current));
  }

  function updateMetric(metricId: string, mutator: (metric: any) => any) {
    updateRuleSet((current) => ({
      ...current,
      metricDefinitions: (current.metricDefinitions ?? []).map((metric: any) => (metric.id === metricId ? mutator(clone(metric)) : metric)),
    }));
  }

  function addMetric() {
    const provider = Object.keys(fieldCatalog)[0] ?? "gohighlevel";
    const object = Object.keys(fieldCatalog[provider]?.objects ?? {})[0] ?? "contacts";
    const field = getFieldOptions(fieldCatalog, provider, object)[0] ?? "";
    const nextId = `custom_${Date.now()}`;
    updateRuleSet((current) => ({
      ...current,
      metricDefinitions: [
        ...(current.metricDefinitions ?? []),
        {
          id: nextId,
          name: "New Metric",
          source: provider,
          provider,
          object,
          operation: "count",
          field,
          dateField: "",
          conditions: [],
          formula: "",
          displayType: "number",
          currentOutputPath: "",
          description: "",
        },
      ],
    }));
    setSelectedMetricId(nextId);
  }

  function removeMetric(metricId: string) {
    updateRuleSet((current) => ({
      ...current,
      metricDefinitions: (current.metricDefinitions ?? []).filter((metric: any) => metric.id !== metricId),
      settings: {
        ...current.settings,
        dashboardSections: (current.settings?.dashboardSections ?? []).map((section: any) => ({
          ...section,
          metricIds: (section.metricIds ?? []).filter((id: string) => id !== metricId),
        })),
      },
    }));
  }

  function addCondition(metricId: string) {
    updateMetric(metricId, (metric) => ({
      ...metric,
      conditions: [
        ...(metric.conditions ?? []),
        {
          id: `condition_${Date.now()}`,
          field: getFieldOptions(fieldCatalog, metric.provider, metric.object)[0] ?? "",
          operator: "equals",
          value: "",
        },
      ],
    }));
  }

  function updateCondition(metricId: string, conditionId: string, patch: AnyRecord) {
    updateMetric(metricId, (metric) => ({
      ...metric,
      conditions: (metric.conditions ?? []).map((condition: any) => (condition.id === conditionId ? { ...condition, ...patch } : condition)),
    }));
  }

  function removeCondition(metricId: string, conditionId: string) {
    updateMetric(metricId, (metric) => ({
      ...metric,
      conditions: (metric.conditions ?? []).filter((condition: any) => condition.id !== conditionId),
    }));
  }

  function addSection(kind: "metric_band" | "table") {
    const nextId = `${kind}_${Date.now()}`;
    updateRuleSet((current) => ({
      ...current,
      settings: {
        ...current.settings,
        dashboardSections: [
          ...(current.settings?.dashboardSections ?? []),
          kind === "metric_band"
            ? { id: nextId, title: "Custom Metric Band", kind, visible: true, metricIds: [] }
            : { id: nextId, title: "Custom Table", kind, visible: true, tableId: "unmatched_review" },
        ],
      },
    }));
  }

  function updateSection(sectionId: string, patch: AnyRecord) {
    updateRuleSet((current) => ({
      ...current,
      settings: {
        ...current.settings,
        dashboardSections: (current.settings?.dashboardSections ?? []).map((section: any) => (section.id === sectionId ? { ...section, ...patch } : section)),
      },
    }));
  }

  function moveSection(sectionId: string, direction: -1 | 1) {
    updateRuleSet((current) => {
      const nextSections = [...(current.settings?.dashboardSections ?? [])];
      const index = nextSections.findIndex((section: any) => section.id === sectionId);
      const swapIndex = index + direction;
      if (index < 0 || swapIndex < 0 || swapIndex >= nextSections.length) return current;
      [nextSections[index], nextSections[swapIndex]] = [nextSections[swapIndex], nextSections[index]];
      return {
        ...current,
        settings: {
          ...current.settings,
          dashboardSections: nextSections,
        },
      };
    });
  }

  function toggleMetricInSection(sectionId: string, metricId: string) {
    updateRuleSet((current) => ({
      ...current,
      settings: {
        ...current.settings,
        dashboardSections: (current.settings?.dashboardSections ?? []).map((section: any) => {
          if (section.id !== sectionId || section.kind !== "metric_band") return section;
          const metricIds = new Set(section.metricIds ?? []);
          if (metricIds.has(metricId)) metricIds.delete(metricId);
          else metricIds.add(metricId);
          return { ...section, metricIds: Array.from(metricIds) };
        }),
      },
    }));
  }

  if (loading) {
    return (
      <main className={styles.screen}>
        <div className={styles.loadingBox}>
          <Loader2 className={styles.spin} />
          <p className={styles.copy}>Loading contractor metrics workspace.</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return <Gate title="Sign in to open contractor metrics." body="This workspace uses your Trust Compression session plus server-side connected accounts." />;
  }

  if (!workspaceId || !ruleSetDraft) {
    return <Gate title="Workspace not ready." body={error || "We could not load the contractor metrics workspace right now."} />;
  }

  return (
    <main className={styles.screen}>
      <section className={styles.hero}>
        <span>Contractor Metrics</span>
        <h1>Live CRM reporting with source previews and optional cache sync.</h1>
        <p>Preview live source rows, generate the contractor dashboard directly from connected CRMs, and keep cache sync available only for backchecks or normalized-source review.</p>
        <div className={styles.heroActions}>
          <Link href="/" className={styles.linkButton}>Open main app</Link>
          <button className={styles.secondary} type="button" disabled={working === "refresh"} onClick={() => refresh()}><RefreshCw />Refresh workspace</button>
          <button className={styles.primary} type="button" disabled={working === "report"} onClick={runReport}><Sparkles />{working === "report" ? "Generating..." : "Run contractor report"}</button>
        </div>
      </section>

      {notice ? <div className={styles.notice}>{notice}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      <nav className={styles.shellTabs}>
        {TABS.map((entry) => {
          const Icon = entry.icon;
          return <button key={entry.id} type="button" className={tab === entry.id ? styles.shellTabActive : styles.shellTab} onClick={() => setTab(entry.id)}><Icon />{entry.label}</button>;
        })}
      </nav>

      {tab === "connections" ? renderConnections() : null}
      {tab === "metrics" ? renderMetrics() : null}
      {tab === "config" ? renderConfig() : null}
    </main>
  );

  function renderConnections() {
    return (
      <div className={styles.stack}>
        <section className={styles.grid}>
          <ConnectionCard title="GoHighLevel private integration" description="Save a private integration token server-side, then preview live contacts or optionally cache them into this workspace.">
            <form className={styles.formGrid} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void postAction("/api/connect/ghl", "connect-ghl", { workspaceId, accountLabel: ghl.accountLabel, privateIntegrationToken: ghl.privateIntegrationToken, locationId: ghl.locationId, externalAccountId: ghl.externalAccountId || undefined, apiBaseUrl: ghl.apiBaseUrl }); setGhl((current) => ({ ...current, privateIntegrationToken: "" })); }}>
              <Field label="Account label" value={ghl.accountLabel} onChange={(value) => setGhl((current) => ({ ...current, accountLabel: value }))} />
              <Field label="Location ID" value={ghl.locationId} onChange={(value) => setGhl((current) => ({ ...current, locationId: value }))} />
              <Field label="External account ID" value={ghl.externalAccountId} onChange={(value) => setGhl((current) => ({ ...current, externalAccountId: value }))} />
              <Field label="API base URL" value={ghl.apiBaseUrl} onChange={(value) => setGhl((current) => ({ ...current, apiBaseUrl: value }))} />
              <Field label="Private integration token" type="password" value={ghl.privateIntegrationToken} onChange={(value) => setGhl((current) => ({ ...current, privateIntegrationToken: value }))} />
              <button className={styles.primary} type="submit" disabled={working === "connect-ghl"}><Save />Save GoHighLevel account</button>
            </form>
          </ConnectionCard>

          <ConnectionCard title="JobTread grant key" description="Save a JobTread Open API grant key server-side, then preview live jobs or optionally cache them into this workspace.">
            <form className={styles.formGrid} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void postAction("/api/connect/jobtread", "connect-jobtread", { workspaceId, accountLabel: jobtread.accountLabel, apiToken: jobtread.apiToken, externalAccountId: jobtread.externalAccountId || undefined, apiBaseUrl: jobtread.apiBaseUrl }); setJobtread((current) => ({ ...current, apiToken: "" })); }}>
              <Field label="Account label" value={jobtread.accountLabel} onChange={(value) => setJobtread((current) => ({ ...current, accountLabel: value }))} />
              <Field label="External account ID" value={jobtread.externalAccountId} onChange={(value) => setJobtread((current) => ({ ...current, externalAccountId: value }))} />
              <Field label="API base URL" value={jobtread.apiBaseUrl} onChange={(value) => setJobtread((current) => ({ ...current, apiBaseUrl: value }))} />
              <Field label="Grant key" type="password" value={jobtread.apiToken} onChange={(value) => setJobtread((current) => ({ ...current, apiToken: value }))} />
              <button className={styles.primary} type="submit" disabled={working === "connect-jobtread"}><Save />Save JobTread account</button>
            </form>
          </ConnectionCard>
        </section>

        <section className={styles.grid}>
          <Panel title={`Connected accounts (${accounts.length})`} icon={<Link2 />}>
            <div className={styles.accountList}>
              {accounts.length ? accounts.map((account) => {
                const accountPreview = previews[account.id];
                const filters = previewFilters[account.id] ?? defaultPreviewFilters(accountPreview?.filters);
                const filteredRows = accountPreview ? applyPreviewFilters(accountPreview.rows, accountPreview.filters, filters) : [];

                return (
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
                    {account.metadata?.lastSyncSummary ? (
                      <div className={styles.statusStrip}>
                        <Pill label="Imported" value={String(account.metadata.lastSyncSummary.imported ?? 0)} />
                        <Pill label="Updated" value={String(account.metadata.lastSyncSummary.updated ?? 0)} />
                        <Pill label="Skipped" value={String(account.metadata.lastSyncSummary.skipped ?? 0)} />
                      </div>
                    ) : null}
                    <div className={styles.formGrid}>
                      <Field
                        label="Preview row limit"
                        type="number"
                        value={(previewRequests[account.id] ?? defaultPreviewRequest()).limit}
                        onChange={(value) => updatePreviewRequest(account.id, "limit", value)}
                      />
                      <Field
                        label="Preview start date"
                        type="date"
                        value={(previewRequests[account.id] ?? defaultPreviewRequest()).startDate}
                        onChange={(value) => updatePreviewRequest(account.id, "startDate", value)}
                      />
                      <Field
                        label="Preview end date"
                        type="date"
                        value={(previewRequests[account.id] ?? defaultPreviewRequest()).endDate}
                        onChange={(value) => updatePreviewRequest(account.id, "endDate", value)}
                      />
                    </div>
                    <div className={styles.actionRow}>
                      <button className={styles.secondary} type="button" disabled={working === `sync-${account.id}`} onClick={() => postAction("/api/metrics/contractor/sync", `sync-${account.id}`, { workspaceId, connectedAccountId: account.id })}><RefreshCw />Cache sync (optional)</button>
                      <button className={styles.ghost} type="button" disabled={working === `preview-${account.id}`} onClick={() => loadPreview(account.id)}><Database />{working === `preview-${account.id}` ? "Loading preview..." : "Preview live rows"}</button>
                    </div>
                    {accountPreview ? (
                      <SourcePreviewPanel
                        preview={accountPreview}
                        filters={filters}
                        filteredRows={filteredRows}
                        onFilterChange={(key, value) => updatePreviewFilter(account.id, key, value)}
                      />
                    ) : null}
                  </article>
                );
              }) : <p className={styles.empty}>No connected accounts yet.</p>}
            </div>
          </Panel>

          <Panel title={`Normalized sources (${sources.length})`} icon={<Database />}>
            <div className={styles.sourceList}>
              {sources.length ? sources.map((source) => (
                <article key={source.id} className={styles.sourceRow}>
                  <div>
                    <span>{providerLabel(source.provider)}</span>
                    <strong>{source.display_name}</strong>
                  </div>
                  <div className={styles.sourceMeta}>
                    <small>{source.status}</small>
                    <small>Last synced {formatDateTime(source.last_synced_at || source.updated_at)}</small>
                    {source.last_error ? <small className={styles.rowError}>{source.last_error}</small> : null}
                  </div>
                </article>
              )) : <p className={styles.empty}>No cached sources yet. Live report runs do not require a cache sync.</p>}
            </div>
          </Panel>
        </section>
      </div>
    );
  }

  function renderMetrics() {
    return (
      <div className={styles.stack}>
        <section className={styles.controlGrid}>
          <Panel title="Report run controls" icon={<BarChart3 />}>
            <div className={styles.formGrid}>
              <Field label="Client name" value={clientName} onChange={setClientName} />
              <SelectField label="Report template" value={selectedRuleSetId ?? ""} onChange={(value) => { setSelectedRuleSetId(value); const next = ruleSets.find((entry) => entry.id === value) ?? null; setRuleSetDraft(clone(next)); }} options={ruleSets.map((entry) => ({ value: entry.id ?? entry.slug, label: entry.name }))} />
              <Field label="Start date" type="date" value={startDate} onChange={setStartDate} />
              <Field label="End date" type="date" value={endDate} onChange={setEndDate} />
            </div>
          </Panel>
          <Panel title="Dashboard status" icon={<Database />}>
            <div className={styles.statusStrip}>
              <Pill label="Connected accounts" value={String(accounts.length)} />
              <Pill label="Normalized sources" value={String(sources.length)} />
              <Pill label="Saved runs" value={String(reports.length)} />
            </div>
          </Panel>
        </section>

        {activeReport ? (
          <>
            <section className={styles.grid}>
              <Panel title="Executive Summary" icon={<Sparkles />}>
                <div className={styles.summaryList}>
                  {(activeReport.executiveSummary?.length ? activeReport.executiveSummary : ["Run the report to populate the owner summary."]).map((line: string, index: number) => (
                    <div key={`${index}-${line}`} className={styles.summaryRow}>{line}</div>
                  ))}
                </div>
              </Panel>
              <Panel title="Latest report snapshot" icon={<Database />}>
                <div className={styles.reportList}>
                  <div className={styles.reportRow}>
                    <strong>{activeReport.ruleSet?.name ?? ruleSetDraft.name}</strong>
                    <small>{startDate} to {endDate}</small>
                    <small>Generated {formatDateTime(activeReport.createdAt)}</small>
                  </div>
                  <div className={styles.inlineStat}>
                    <span>Source rows</span>
                    <strong>{String(activeReport.sourceSnapshot?.leadRows ?? 0)} leads / {String(activeReport.sourceSnapshot?.jobRows ?? 0)} jobs / {String(activeReport.sourceSnapshot?.spendRows ?? 0)} spend</strong>
                  </div>
                </div>
              </Panel>
            </section>

            {sections.filter((section: any) => section.visible !== false).map((section: any) => {
              if (section.kind === "summary") return null;
              if (section.kind === "metric_band") {
                return (
                  <Panel key={section.id} title={section.title} icon={<BarChart3 />}>
                    <div className={styles.metricBand}>
                      {(section.metricIds ?? []).map((metricId: string) => {
                        const metric = metricMap[metricId];
                        if (!metric) return null;
                        return (
                          <MetricCard
                            key={metricId}
                            label={metric.name}
                            value={formatMetricValue(metric.value, metric.displayType)}
                            detail={metric.description ?? metric.formula ?? "Starter metric"}
                            delta={metricDelta(metric, comparisonMap[metricId])}
                            inspector={buildMetricInspector(metric)}
                          />
                        );
                      })}
                    </div>
                  </Panel>
                );
              }
              return <DataPanel key={section.id} title={section.title} tableId={section.tableId} report={activeReport} />;
            })}

            <Panel title="Recent saved runs" icon={<Database />}>
              <div className={styles.reportList}>
                {reports.length ? reports.map((report) => (
                  <button key={report.id} type="button" className={styles.reportRow} onClick={() => setPreview(fromStoredReport(report, ruleSetDraft))}>
                    <strong>{report.client_name || "Contractor Report"}</strong>
                    <small>{report.start_date} to {report.end_date}</small>
                    <small>{formatDateTime(report.created_at)}</small>
                  </button>
                )) : <p className={styles.empty}>No saved runs yet.</p>}
              </div>
            </Panel>
          </>
        ) : <Panel title="Metrics" icon={<BarChart3 />}><p className={styles.copy}>Run the contractor report to load live workspace data, or open one of the saved runs below.</p><div className={styles.reportList}>{reports.length ? reports.map((report) => (<button key={report.id} type="button" className={styles.reportRow} onClick={() => setPreview(fromStoredReport(report, ruleSetDraft))}><strong>{report.client_name || "Contractor Report"}</strong><small>{report.start_date} to {report.end_date}</small><small>{formatDateTime(report.created_at)}</small></button>)) : <p className={styles.empty}>No saved runs yet.</p>}</div></Panel>}
      </div>
    );
  }

  function renderConfig() {
    return (
      <div className={styles.stack}>
        <section className={styles.builderHeader}>
          <div>
            <span>Builder</span>
            <h2>Restore clarity to the live dashboard.</h2>
            <p className={styles.copy}>This config controls the cards and sections that appear on the live metrics screen. Each custom metric stays plain-language and uses CRM field catalogs instead of raw JSON.</p>
          </div>
          <div className={styles.heroActions}>
            <button className={styles.secondary} type="button" onClick={addMetric}><Plus />Add metric</button>
            <button className={styles.ghost} type="button" onClick={() => addSection("metric_band")}><Plus />Add metric band</button>
            <button className={styles.ghost} type="button" onClick={() => addSection("table")}><Plus />Add table section</button>
          </div>
        </section>

        <section className={styles.controlGrid}>
          <Panel title="Workspace report config" icon={<Settings2 />}>
            <div className={styles.formGrid}>
              <Field label="Template name" value={ruleSetDraft.name ?? ""} onChange={(value) => setRuleSetDraft((current: any) => ({ ...current, name: value, slug: slugify(value) }))} />
              <SelectField label="Comparison mode" value={ruleSetDraft.settings?.comparisonMode ?? "previous_period"} onChange={(value) => setRuleSetDraft((current: any) => ({ ...current, settings: { ...current.settings, comparisonMode: value } }))} options={[{ value: "previous_period", label: "Previous period" }, { value: "none", label: "None" }]} />
              <TextAreaField label="Template description" value={ruleSetDraft.description ?? ""} onChange={(value) => setRuleSetDraft((current: any) => ({ ...current, description: value }))} />
            </div>
            <div className={styles.actionRow}>
              <button className={styles.primary} type="button" disabled={working === "save-rule-set"} onClick={saveRuleSet}><Save />Save workspace config</button>
            </div>
          </Panel>
          <Panel title="Current template" icon={<Database />}>
            <div className={styles.reportList}>
              <div className={styles.reportRow}>
                <strong>{ruleSetDraft.name}</strong>
                <small>{ruleSetDraft.description || "Default contractor dashboard template."}</small>
              </div>
              <div className={styles.inlineStat}>
                <span>Custom metrics</span>
                <strong>{String(metrics.length)}</strong>
              </div>
              <div className={styles.inlineStat}>
                <span>Visible sections</span>
                <strong>{String(sections.filter((section: any) => section.visible !== false).length)}</strong>
              </div>
            </div>
          </Panel>
        </section>

        <section className={styles.grid}>
          <Panel title="Dashboard layout" icon={<BarChart3 />}>
            <div className={styles.reportList}>
              {sections.map((section: any, index: number) => (
                <article key={section.id} className={styles.layoutRow}>
                  <div className={styles.layoutMeta}>
                    <span>{section.kind === "metric_band" ? "Metric band" : section.kind === "table" ? "Table section" : "Summary"}</span>
                    <strong>{section.title}</strong>
                    <small>{section.kind === "metric_band" ? `${(section.metricIds ?? []).length} cards` : section.tableId ? prettyLabel(section.tableId) : "Narrative summary"}</small>
                  </div>
                  <div className={styles.layoutControls}>
                    <input value={section.title ?? ""} onChange={(event) => updateSection(section.id, { title: event.target.value })} placeholder="Section title" />
                    {section.kind === "table" ? (
                      <select value={section.tableId ?? "unmatched_review"} onChange={(event) => updateSection(section.id, { tableId: event.target.value })}>
                        {TABLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    ) : null}
                    <label className={styles.toggle}><input type="checkbox" checked={section.visible !== false} onChange={(event) => updateSection(section.id, { visible: event.target.checked })} />Visible</label>
                    <button className={styles.iconButton} type="button" disabled={index === 0} onClick={() => moveSection(section.id, -1)} aria-label="Move section up"><ArrowUp /></button>
                    <button className={styles.iconButton} type="button" disabled={index === sections.length - 1} onClick={() => moveSection(section.id, 1)} aria-label="Move section down"><ArrowDown /></button>
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Metric catalog" icon={<Database />}>
            <div className={styles.reportList}>
              {metrics.map((metric: any) => (
                <button key={metric.id} type="button" className={selectedMetricId === metric.id ? styles.metricListItemActive : styles.metricListItem} onClick={() => setSelectedMetricId(metric.id)}>
                  <strong>{metric.name}</strong>
                  <small>{describeMetricDefinition(metric)}</small>
                </button>
              ))}
            </div>
          </Panel>
        </section>

        {selectedMetric ? (
          <section className={styles.grid}>
            <Panel title="Metric builder" icon={<Settings2 />}>
              <div className={styles.wizardPreview}>
                <span>Formula preview</span>
                <strong>{selectedMetric.name}</strong>
                <small>{describeMetricDefinition(selectedMetric)}</small>
              </div>

              <div className={styles.formGrid}>
                <Field label="Metric name" value={selectedMetric.name ?? ""} onChange={(value) => updateMetric(selectedMetric.id, (metric) => ({ ...metric, name: value }))} />
                <SelectField label="Display type" value={selectedMetric.displayType ?? "number"} onChange={(value) => updateMetric(selectedMetric.id, (metric) => ({ ...metric, displayType: value }))} options={DISPLAY_TYPES.map((value) => ({ value, label: prettyLabel(value) }))} />
                <SelectField label="Provider" value={selectedMetric.provider ?? ""} onChange={(value) => updateMetric(selectedMetric.id, (metric) => {
                  const nextObject = Object.keys(fieldCatalog[value]?.objects ?? {})[0] ?? "";
                  const nextField = getFieldOptions(fieldCatalog, value, nextObject)[0] ?? "";
                  return { ...metric, provider: value, source: value, object: nextObject, field: nextField, dateField: "" };
                })} options={Object.entries(fieldCatalog).map(([value, provider]) => ({ value, label: provider.label ?? prettyLabel(value) }))} />
                <SelectField label="Object" value={selectedMetric.object ?? ""} onChange={(value) => updateMetric(selectedMetric.id, (metric) => ({ ...metric, object: value, field: getFieldOptions(fieldCatalog, metric.provider, value)[0] ?? "" }))} options={Object.keys(fieldCatalog[selectedMetric.provider]?.objects ?? {}).map((value) => ({ value, label: prettyLabel(value) }))} />
                <SelectField label="Operation" value={selectedMetric.operation ?? "count"} onChange={(value) => updateMetric(selectedMetric.id, (metric) => ({ ...metric, operation: value, formula: value === "formula" ? metric.formula ?? "" : "" }))} options={METRIC_OPERATIONS.map((value) => ({ value, label: prettyLabel(value) }))} />
                <SelectField label="Value field" value={selectedMetric.field ?? ""} onChange={(value) => updateMetric(selectedMetric.id, (metric) => ({ ...metric, field: value }))} options={(selectedMetricFields.length ? selectedMetricFields : [""]).map((value) => ({ value, label: value ? value : "No field required" }))} />
                <SelectField label="Date field" value={selectedMetric.dateField ?? ""} onChange={(value) => updateMetric(selectedMetric.id, (metric) => ({ ...metric, dateField: value }))} options={[{ value: "", label: "Use report default" }, ...selectedMetricFields.map((value) => ({ value, label: value }))]} />
                <TextAreaField label="Metric description" value={selectedMetric.description ?? ""} onChange={(value) => updateMetric(selectedMetric.id, (metric) => ({ ...metric, description: value }))} />
                {selectedMetric.operation === "formula" ? (
                  <TextAreaField label="Formula" value={selectedMetric.formula ?? ""} onChange={(value) => updateMetric(selectedMetric.id, (metric) => ({ ...metric, formula: value }))} />
                ) : null}
              </div>

              <div className={styles.previewPanel}>
                <div className={styles.previewHeader}>
                  <div>
                    <span>Available CRM fields</span>
                    <p className={styles.copy}>These are the selectable fields for the current provider and object.</p>
                  </div>
                </div>
                <div className={styles.previewFieldList}>
                  {selectedMetricFields.map((field) => <span key={field} className={styles.previewFieldPill}>{field}</span>)}
                </div>
              </div>

              <div className={styles.previewPanel}>
                <div className={styles.previewHeader}>
                  <div>
                    <span>Filter conditions</span>
                    <p className={styles.copy}>Set the exact field conditions used to calculate this metric.</p>
                  </div>
                  <button className={styles.secondary} type="button" onClick={() => addCondition(selectedMetric.id)}><Plus />Add condition</button>
                </div>
                <div className={styles.reportList}>
                  {(selectedMetric.conditions ?? []).map((condition: any) => (
                    <div key={condition.id} className={styles.conditionRow}>
                      <select
                        value={conditionTargetKind(condition)}
                        onChange={(event) => {
                          const nextKind = event.target.value;
                          if (nextKind === "classification") updateCondition(selectedMetric.id, condition.id, { classification: Object.keys(ruleSetDraft.classifications ?? {})[0] ?? "sourceBucket", field: undefined, ruleRef: undefined });
                          else if (nextKind === "ruleRef") updateCondition(selectedMetric.id, condition.id, { ruleRef: "soldJob", field: undefined, classification: undefined });
                          else updateCondition(selectedMetric.id, condition.id, { field: selectedMetricFields[0] ?? "", classification: undefined, ruleRef: undefined });
                        }}
                      >
                        <option value="field">Field</option>
                        <option value="classification">Classification</option>
                        <option value="ruleRef">Rule</option>
                      </select>
                      {conditionTargetKind(condition) === "classification" ? (
                        <select value={condition.classification ?? "sourceBucket"} onChange={(event) => updateCondition(selectedMetric.id, condition.id, { classification: event.target.value })}>
                          {Object.keys(ruleSetDraft.classifications ?? {}).map((value) => <option key={value} value={value}>{prettyLabel(value)}</option>)}
                        </select>
                      ) : conditionTargetKind(condition) === "ruleRef" ? (
                        <input value={condition.ruleRef ?? ""} onChange={(event) => updateCondition(selectedMetric.id, condition.id, { ruleRef: event.target.value })} placeholder="Rule reference" />
                      ) : (
                        <select value={condition.field ?? ""} onChange={(event) => updateCondition(selectedMetric.id, condition.id, { field: event.target.value })}>
                          {selectedMetricFields.map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                      )}
                      <select value={condition.operator ?? "equals"} onChange={(event) => updateCondition(selectedMetric.id, condition.id, { operator: event.target.value })}>
                        {CONDITION_OPERATORS.map((value) => <option key={value} value={value}>{prettyLabel(value)}</option>)}
                      </select>
                      <input
                        value={Array.isArray(condition.value) ? condition.value.join(", ") : condition.value ?? ""}
                        onChange={(event) => updateCondition(selectedMetric.id, condition.id, {
                          value: ["between", "in", "not_in"].includes(condition.operator) ? toCommaList(event.target.value) : event.target.value,
                        })}
                        placeholder="Value or comma list"
                      />
                      <button className={styles.iconButton} type="button" onClick={() => removeCondition(selectedMetric.id, condition.id)} aria-label="Remove condition"><Trash2 /></button>
                    </div>
                  ))}
                  {selectedMetric.conditions?.length ? null : <p className={styles.empty}>No conditions yet. Add filters if this metric should segment by source, status, date, or campaign.</p>}
                </div>
              </div>

              <div className={styles.actionRow}>
                <button className={styles.ghost} type="button" onClick={() => removeMetric(selectedMetric.id)}><Trash2 />Remove metric</button>
              </div>
            </Panel>

            <Panel title="Card placement" icon={<BarChart3 />}>
              <div className={styles.reportList}>
                {sections.filter((section: any) => section.kind === "metric_band").map((section: any) => (
                  <article key={section.id} className={styles.ruleCard}>
                    <div className={styles.ruleCardHeader}>
                      <div className={styles.layoutMeta}>
                        <span>Metric band</span>
                        <strong>{section.title}</strong>
                      </div>
                      <label className={styles.toggle}>
                        <input type="checkbox" checked={(section.metricIds ?? []).includes(selectedMetric.id)} onChange={() => toggleMetricInSection(section.id, selectedMetric.id)} />
                        Show card
                      </label>
                    </div>
                    <small>{(section.metricIds ?? []).length} cards in this band</small>
                  </article>
                ))}
              </div>
            </Panel>
          </section>
        ) : null}
      </div>
    );
  }
}

function Gate({ title, body }: { title: string; body: string }) {
  return <main className={styles.screen}><section className={styles.hero}><span>Contractor Metrics</span><h1>{title}</h1><p>{body}</p></section></main>;
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className={styles.panel}><div className={styles.panelHead}><span>{title}</span>{icon}</div>{children}</section>;
}

function ConnectionCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className={styles.panel}><div className={styles.panelHead}><span>{title}</span><Link2 /></div><p className={styles.copy}>{description}</p>{children}</section>;
}

function Pill({ label, value }: { label: string; value: string }) {
  return <div className={styles.statusPill}><span>{label}</span><strong>{value}</strong></div>;
}

function MetricCard({ label, value, detail, delta, inspector }: { label: string; value: string; detail: string; delta?: string | null; inspector?: string }) {
  return (
    <div className={styles.metricCard} title={inspector || detail}>
      <div className={styles.metricCardTop}>
        <span>{label}</span>
        {inspector ? <Info className={styles.metricInfoIcon} /> : null}
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
      {delta ? <em>{delta}</em> : null}
      {inspector ? <div className={styles.metricTooltip}>{inspector}</div> : null}
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={`${option.value}-${option.label}`} value={option.value}>{option.label}</option>)}</select></label>;
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className={styles.fullField}><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SourcePreviewPanel({
  preview,
  filters,
  filteredRows,
  onFilterChange,
}: {
  preview: SourcePreview;
  filters: PreviewFilterState;
  filteredRows: AnyRecord[];
  onFilterChange: (key: string, value: string) => void;
}) {
  return (
    <div className={styles.reportList}>
      <div className={styles.reportRow}>
        <strong>{preview.accountLabel || providerLabel(preview.provider)}</strong>
        <small>{preview.totalRows} fetched rows | updated {formatDateTime(preview.fetchedAt)}</small>
        <small>Fields: {preview.fieldCatalog.slice(0, 8).join(", ")}</small>
      </div>
      <div className={styles.formGrid}>
        <Field label="Search rows" value={filters.search ?? ""} onChange={(value) => onFilterChange("search", value)} />
        {preview.filters.map((filter) => (
          <SelectField
            key={filter.key}
            label={filter.label}
            value={filters[filter.key] ?? ""}
            onChange={(value) => onFilterChange(filter.key, value)}
            options={[{ value: "", label: `All ${filter.label}` }, ...filter.options.map((option) => ({ value: option, label: option }))]}
          />
        ))}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {preview.columns.map((column) => <th key={column.key}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length ? filteredRows.map((row, index) => (
              <tr key={`${preview.connectedAccountId}-${row.id ?? row.jobNumber ?? row.email ?? index}`}>
                {preview.columns.map((column) => <td key={column.key}>{formatCell(row[column.key], column.key === "revenue" ? "currency" : undefined)}</td>)}
              </tr>
            )) : <tr><td colSpan={preview.columns.length}>No rows match the current filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DataPanel({ title, tableId, report }: { title: string; tableId: string; report: any }) {
  const section = resolveTable(tableId, report);
  return <Panel title={title} icon={<Database />}>{section.description ? <p className={styles.copy}>{section.description}</p> : null}<div className={styles.tableWrap}><table className={styles.table}><thead><tr>{section.columns.map((column: any) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{section.rows.length ? section.rows.map((row: any, index: number) => <tr key={`${row.id ?? row.jobId ?? row.name ?? row.source ?? index}`}>{section.columns.map((column: any) => <td key={column.key}>{formatCell(row[column.key], column.format)}</td>)}</tr>) : <tr><td colSpan={section.columns.length}>No rows yet.</td></tr>}</tbody></table></div></Panel>;
}

function resolveTable(tableId: string, report: any) {
  if (tableId === "paid_channel_performance") return { description: "Spend, appointments, sold jobs, revenue, and efficiency by paid vendor alias.", rows: report.dashboard?.paidChannelPerformance ?? report.breakdowns?.byVendor ?? [], columns: [{ key: "name", label: "Name" }, { key: "spend", label: "Spend", format: "currency" }, { key: "leads", label: "Leads" }, { key: "issuedLeads", label: "Appointments" }, { key: "soldJobs", label: "Sold Jobs" }, { key: "revenue", label: "Revenue", format: "currency" }, { key: "costPerLead", label: "Cost / Lead", format: "currency" }, { key: "costPerIssuedLead", label: "Cost / Booked Appt", format: "currency" }, { key: "roas", label: "ROAS", format: "ratio" }, { key: "closeRate", label: "Close Rate", format: "percent" }] };
  if (tableId === "design_consultant_performance") return { description: "Appointments, sold jobs, and revenue output by design consultant.", rows: report.dashboard?.designConsultantPerformance ?? report.breakdowns?.byDesignConsultant ?? [], columns: [{ key: "designConsultant", label: "Design Consultant" }, { key: "appointments", label: "Appointments" }, { key: "soldJobs", label: "Sold Jobs" }, { key: "revenue", label: "Revenue", format: "currency" }, { key: "closeRate", label: "Close Rate", format: "percent" }, { key: "averageJobSize", label: "Avg Job Size", format: "currency" }, { key: "revenuePerAppointment", label: "Revenue / Appt", format: "currency" }] };
  if (tableId === "leads_by_source") return { description: "Source-level performance across leads, appointments, sold jobs, and revenue.", rows: report.dashboard?.leadsBySource ?? report.breakdowns?.byLeadSource ?? [], columns: [{ key: "source", label: "Source" }, { key: "leads", label: "Leads" }, { key: "issuedLeads", label: "Appointments" }, { key: "soldJobs", label: "Sold Jobs" }, { key: "revenue", label: "Revenue", format: "currency" }, { key: "closeRate", label: "Close Rate", format: "percent" }, { key: "netSalesPerLeadIssued", label: "NSLI", format: "currency" }] };
  if (tableId === "jobs_sold_detail") return { description: "Inline sold-job drilldown with attributed source, consultant, project manager, and time to close.", rows: report.dashboard?.jobsSoldDetail ?? report.breakdowns?.jobsSoldDetail ?? [], columns: [{ key: "jobId", label: "Job ID" }, { key: "customer", label: "Customer" }, { key: "projectType", label: "Project Type" }, { key: "soldDate", label: "Sold Date" }, { key: "leadCreatedEastern", label: "Lead Created (ET)" }, { key: "timeToClose", label: "Time to Close" }, { key: "attributedSource", label: "Attributed Source" }, { key: "sourceBucket", label: "Source Bucket" }, { key: "designConsultant", label: "Design Consultant" }, { key: "projectManager", label: "Project Manager" }, { key: "revenue", label: "Revenue", format: "currency" }] };
  if (tableId === "closing_outcomes") return { description: "Regex-based closing outcome scan for appointments that did not sell.", rows: report.dashboard?.closingOutcomes ?? report.breakdowns?.closingOutcomes ?? [], columns: [{ key: "reason", label: "Reason" }, { key: "jobs", label: "Jobs" }, { key: "examples", label: "Examples" }, { key: "description", label: "Description" }] };
  return { description: "Records that were not matched between CRM leads and jobs.", rows: [...((report.unmatched?.leads ?? []).slice(0, 50).map((lead: any) => ({ type: "lead", label: lead.name || lead.email || lead.id || "Unknown lead", reason: lead.reason || "Not matched" })) ?? []), ...((report.unmatched?.jobs ?? []).slice(0, 50).map((job: any) => ({ type: "job", label: job.jobNumber || job.customer || job.id || "Unknown job", reason: job.reason || "Not matched" })) ?? [])], columns: [{ key: "type", label: "Type" }, { key: "label", label: "Record" }, { key: "reason", label: "Reason" }] };
}

function defaultPreviewFilters(filters?: Array<{ key: string }>) {
  return (filters ?? []).reduce((result, filter) => {
    result[filter.key] = "";
    return result;
  }, { search: "" } as PreviewFilterState);
}

function defaultPreviewRequest(): PreviewRequestState {
  return {
    limit: "100",
    startDate: "",
    endDate: "",
  };
}

function applyPreviewFilters(rows: AnyRecord[], filterDefinitions: Array<{ key: string }>, filters: PreviewFilterState) {
  const search = String(filters.search ?? "").trim().toLowerCase();
  return rows.filter((row) => {
    if (search) {
      const haystack = Object.values(row).flatMap((value) => (Array.isArray(value) ? value : [value])).map((value) => String(value ?? "").toLowerCase()).join(" ");
      if (!haystack.includes(search)) return false;
    }

    for (const filter of filterDefinitions) {
      const selected = String(filters[filter.key] ?? "").trim();
      if (!selected) continue;
      const rawValue = row[filter.key];
      if (Array.isArray(rawValue)) {
        if (!rawValue.map((value) => String(value ?? "").trim()).includes(selected)) return false;
      } else if (String(rawValue ?? "").trim() !== selected) {
        return false;
      }
    }

    return true;
  });
}

function normalizeSections(sections?: any[]) {
  if (!sections?.length) return [];
  return sections;
}

function fromStoredReport(report: any, ruleSet: any) {
  if (!report) return null;
  return { reportId: report.id, createdAt: report.created_at, ruleSet, sourceSnapshot: report.source_snapshot ?? {}, totals: report.totals ?? {}, breakdowns: report.breakdowns ?? {}, executiveSummary: report.detail?.executiveSummary ?? [], configuredMetrics: report.detail?.configuredMetrics ?? [], unmatched: report.detail?.unmatched ?? {}, dashboard: report.detail?.dashboard ?? {}, comparison: report.detail?.comparison ?? null };
}

function providerLabel(provider: string) {
  if (provider === "ghl" || provider === "gohighlevel") return "GoHighLevel";
  if (provider === "jobtread") return "JobTread";
  if (provider === "spend") return "Spend";
  if (provider === "combined") return "Combined";
  return provider;
}

function describeAccount(account: any) {
  return [account.metadata?.authMode, account.metadata?.locationId, account.metadata?.companyId, account.metadata?.readonly ? "Readonly" : null].filter(Boolean).join(" / ") || "Ready to sync";
}

function metricDelta(current?: any, previous?: any) {
  const a = Number(current?.value);
  const b = Number(previous?.value);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const delta = a - b;
  if (Math.abs(delta) < 0.00001) return "Flat vs previous period";
  return `${delta > 0 ? "+" : ""}${formatMetricValue(delta, current?.displayType ?? "number", true)} vs previous period`;
}

function formatMetricValue(value: unknown, displayType: string, signed = false) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return displayType === "currency" ? "$0" : "0";
  if (displayType === "currency") return number.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0, signDisplay: signed ? "always" : "auto" });
  if (displayType === "percent") return `${(number * 100).toLocaleString("en-US", { maximumFractionDigits: 1, signDisplay: signed ? "always" : "auto" })}%`;
  if (displayType === "ratio") return `${number.toLocaleString("en-US", { maximumFractionDigits: 2, signDisplay: signed ? "always" : "auto" })}x`;
  if (displayType === "days") return `${number.toLocaleString("en-US", { maximumFractionDigits: 1, signDisplay: signed ? "always" : "auto" })} days`;
  return number.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(number) ? 0 : 1, maximumFractionDigits: Number.isInteger(number) ? 0 : 1, signDisplay: signed ? "always" : "auto" });
}

function formatCell(value: any, format?: string) {
  if (value == null || value === "") return "N/A";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (format) return formatMetricValue(value, format);
  if (typeof value === "number") return formatMetricValue(value, Math.abs(value) <= 1 && String(value).includes(".") ? "percent" : "number");
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
  return String(value);
}

function formatDateTime(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function toLines(value: string) {
  return value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
}

function toCommaList(value: string) {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function slugify(value: string) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function clampPositiveInteger(value: string, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function prettyLabel(value: string) {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (entry) => entry.toUpperCase());
}

function getFieldOptions(fieldCatalog: FieldCatalog, provider?: string, object?: string) {
  if (!provider || !object) return [];
  return fieldCatalog[provider]?.objects?.[object] ?? [];
}

function describeMetricDefinition(metric: any) {
  const base = metric.operation === "formula"
    ? `Formula: ${metric.formula || "Set a formula"}`
    : `${prettyLabel(metric.operation)} ${metric.field ? metric.field : "records"} from ${providerLabel(metric.provider)} ${prettyLabel(metric.object)}`;
  const date = metric.dateField ? ` | Date: ${metric.dateField}` : "";
  const conditions = metric.conditions?.length
    ? ` | Filters: ${metric.conditions.map((condition: any) => `${condition.field || "field"} ${prettyLabel(condition.operator)} ${Array.isArray(condition.value) ? condition.value.join(", ") : condition.value ?? ""}`.trim()).join("; ")}`
    : "";
  return `${base}${date}${conditions}`;
}

function buildMetricInspector(metric: any) {
  return [metric.description, describeMetricDefinition(metric)].filter(Boolean).join("\n");
}

function conditionTargetKind(condition: any) {
  if (condition?.classification) return "classification";
  if (condition?.ruleRef) return "ruleRef";
  return "field";
}
