"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, BarChart3, Database, Info, Link2, Loader2, Plus, RefreshCw, Save, Settings2, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { createDefaultContractorRuleSet } from "@/lib/metrics/contractor/config";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "./contractor-metrics-console.module.css";

type AnyRecord = Record<string, any>;
type TabId = "metrics" | "config" | "connections";
type PreviewFilterState = Record<string, string>;
type PreviewRequestState = {
  limit: string;
  startDate: string;
  endDate: string;
};
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
type FieldCatalog = Record<string, { label?: string; objects?: Record<string, string[]> }>;
type DatasetDefinition = {
  id: string;
  label: string;
  provider: string;
  object: string;
  kind: "raw" | "computed";
  rowGrain: string;
  dateField?: string | null;
  description?: string | null;
  inputDatasets?: string[];
  fields: string[];
  isSystem?: boolean;
};

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

const FORMULA_OPERATORS = ["+", "-", "*", "/"] as const;
const DISPLAY_TYPES = ["currency", "percent", "number", "ratio", "days", "string"] as const;
const METRIC_OPERATIONS = ["count", "sum", "average", "formula"] as const;
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
  const [fieldCatalog, setFieldCatalog] = useState<FieldCatalog>({});
  const [datasetCatalog, setDatasetCatalog] = useState<DatasetDefinition[]>([]);
  const [selectedRuleSetId, setSelectedRuleSetId] = useState<string | null>(null);
  const [ruleSetDraft, setRuleSetDraft] = useState<any | null>(null);
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [previews, setPreviews] = useState<Record<string, SourcePreview>>({});
  const [previewFilters, setPreviewFilters] = useState<Record<string, PreviewFilterState>>({});
  const [previewRequests, setPreviewRequests] = useState<Record<string, PreviewRequestState>>({});
  const [clientName, setClientName] = useState("Trust Compression Contractor Report");
  const [startDate, setStartDate] = useState("2026-06-01");
  const [endDate, setEndDate] = useState("2026-06-30");
  const [ghl, setGhl] = useState(EMPTY_GHL);
  const [jobtread, setJobtread] = useState(EMPTY_JOBTREAD);

  const activeReport = preview ?? fromStoredReport(reports[0] ?? null, ruleSetDraft);
  const activeReportSource = preview ? "Live API response" : activeReport ? "Saved report snapshot" : null;
  const sections = normalizeSections(ruleSetDraft?.settings?.dashboardSections);
  const metrics = ruleSetDraft?.metricDefinitions ?? [];
  const metricMap = Object.fromEntries((activeReport?.configuredMetrics ?? []).map((metric: any) => [metric.id, metric]));
  const comparisonMap = Object.fromEntries((activeReport?.comparison?.configuredMetrics ?? []).map((metric: any) => [metric.id, metric]));
  const datasets = ruleSetDraft?.settings?.datasetDefinitions ?? datasetCatalog;
  const selectedMetric = metrics.find((metric: any) => metric.id === selectedMetricId) ?? metrics[0] ?? null;
  const selectedMetricDatasetId = selectedMetric ? metricDatasetId(selectedMetric) : null;
  const selectedMetricDataset = datasets.find((dataset: DatasetDefinition) => dataset.id === selectedMetricDatasetId) ?? null;
  const selectedMetricFields = selectedMetricDataset?.fields ?? getFieldOptions(fieldCatalog, selectedMetric?.provider, selectedMetric?.object);
  const selectedDataset = datasets.find((dataset: DatasetDefinition) => dataset.id === selectedDatasetId) ?? datasets[0] ?? null;

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
    if (accounts.length > 0 && tab === "connections") setTab("metrics");
  }, [accounts.length, tab]);

  useEffect(() => {
    if (!metrics.length) {
      setSelectedMetricId(null);
      return;
    }
    setSelectedMetricId((current) => (current && metrics.some((metric: any) => metric.id === current) ? current : metrics[0].id));
  }, [metrics]);

  useEffect(() => {
    if (!datasets.length) {
      setSelectedDatasetId(null);
      return;
    }
    setSelectedDatasetId((current) => (current && datasets.some((dataset: DatasetDefinition) => dataset.id === current) ? current : datasets[0].id));
  }, [datasets]);

  async function refresh(nextWorkspaceId = workspaceId, token = session?.access_token) {
    if (!nextWorkspaceId || !token) return;
    setWorking((current) => current || "refresh");
    try {
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

      const accountsJson = await parseJsonResponse(accountsResponse, "Could not load connected accounts.");
      const configJson = await parseJsonResponse(configResponse, "Could not load contractor config.");

      if (!accountsResponse.ok) {
        throw new Error(accountsJson.error ?? "Could not load connected accounts.");
      }

      if (!configResponse.ok) {
        throw new Error(configJson.error ?? "Could not load contractor config.");
      }

      setAccounts(accountsJson.accounts ?? []);
      setSources(sourceRows.data ?? []);
      setReports(reportRows.data ?? []);
      setFieldCatalog(configJson.fieldCatalog ?? {});
      setDatasetCatalog(configJson.datasetCatalog ?? []);
      const nextRuleSets = configJson.ruleSets ?? [];
      setRuleSets(nextRuleSets);
      const currentRuleSet = configJson.currentRuleSet ?? nextRuleSets[0] ?? null;

      const fallbackRuleSet = currentRuleSet ?? createDefaultContractorRuleSet();

      setSelectedRuleSetId((current) => {
        if (current && nextRuleSets.some((entry: any) => entry.id === current)) return current;
        return currentRuleSet?.id ?? current ?? null;
      });
      setRuleSetDraft((current) => {
        if (current?.id) {
          const matchingRuleSet = nextRuleSets.find((entry: any) => entry.id === current.id) ?? null;
          if (matchingRuleSet) return clone(matchingRuleSet);
        }
        if (currentRuleSet) return clone(currentRuleSet);
        if (current) return current;
        return clone(fallbackRuleSet);
      });
      setError("");
    } catch (nextError) {
      setRuleSetDraft((current) => current ?? clone(createDefaultContractorRuleSet()));
      setRuleSets((current) => (current.length ? current : [createDefaultContractorRuleSet()]));
      setError(nextError instanceof Error ? nextError.message : "Could not refresh contractor metrics workspace.");
    } finally {
      setWorking("");
    }
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
      const result = await parseJsonResponse(response, "Request failed.");
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
      const result = await parseJsonResponse(response, "Could not generate contractor report.");
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
      const result = await parseJsonResponse(response, "Could not save contractor report config.");
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
      const result = await parseJsonResponse(response, "Could not preview source rows.");
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
    const dataset = datasets[0] ?? null;
    const nextId = `custom_${Date.now()}`;
    updateRuleSet((current) => ({
      ...current,
      metricDefinitions: [
        ...(current.metricDefinitions ?? []),
        {
          id: nextId,
          name: "New Metric",
          source: dataset?.provider ?? "combined",
          provider: dataset?.provider ?? "combined",
          object: dataset?.object ?? "matched_jobs",
          operation: "formula",
          field: dataset?.fields?.[0] ?? null,
          dateField: dataset?.dateField ?? "",
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

  function updateDataset(datasetId: string, mutator: (dataset: DatasetDefinition) => DatasetDefinition) {
    updateRuleSet((current) => ({
      ...current,
      settings: {
        ...current.settings,
        datasetDefinitions: (current.settings?.datasetDefinitions ?? []).map((dataset: DatasetDefinition) =>
          dataset.id === datasetId ? mutator(clone(dataset)) : dataset
        ),
      },
    }));
  }

  function addComputedDataset() {
    const nextId = `combined.custom_${Date.now()}`;
    updateRuleSet((current) => ({
      ...current,
      settings: {
        ...current.settings,
        datasetDefinitions: [
          ...(current.settings?.datasetDefinitions ?? []),
          {
            id: nextId,
            label: "New Computed Dataset",
            provider: "combined",
            object: nextId.replace(/^combined\./, ""),
            kind: "computed",
            rowGrain: "Describe the row grain for this computed dataset.",
            dateField: "",
            description: "Plan a future computed dataset here before wiring execution logic.",
            inputDatasets: ["jobtread.jobs"],
            fields: ["id"],
            isSystem: false,
          },
        ],
      },
    }));
    setSelectedDatasetId(nextId);
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

  function addSection(kind: "metric_band" | "table") {
    const nextId = `${kind}_${Date.now()}`;
    updateRuleSet((current) => ({
      ...current,
      settings: {
        ...current.settings,
        dashboardSections: [
          ...(current.settings?.dashboardSections ?? []),
          kind === "metric_band"
            ? { id: nextId, title: "Custom Metric Band", kind, visible: true, metricIds: [], columns: 4, density: "comfortable" }
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
        settings: { ...current.settings, dashboardSections: nextSections },
      };
    });
  }

  function toggleMetricInSection(sectionId: string, metricId: str…8235 tokens truncated…ng>{value}</strong></div>;
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

function FormulaBuilder({ metric, metrics, onChange }: { metric: any; metrics: any[]; onChange: (formula: string) => void }) {
  const options = metrics.filter((entry) => entry.id !== metric.id).map((entry) => ({ value: entry.id, label: entry.name }));
  const parsed = parseFormulaExpression(metric.formula);
  const left = parsed?.left ?? options[0]?.value ?? "";
  const operator = parsed?.operator ?? "/";
  const right = parsed?.right ?? options[1]?.value ?? options[0]?.value ?? "";

  function update(next: Partial<{ left: string; operator: string; right: string }>) {
    const resolved = { left, operator, right, ...next };
    onChange([resolved.left, resolved.operator, resolved.right].filter(Boolean).join(" "));
  }

  return (
    <div className={styles.previewPanel}>
      <div className={styles.previewHeader}>
        <div>
          <span>Guided formula composer</span>
          <p className={styles.copy}>Build a metric from two existing metrics using a plain-language operator. This keeps the formula layer auditable.</p>
        </div>
      </div>
      <div className={styles.formulaRow}>
        <select value={left} onChange={(event) => update({ left: event.target.value })}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select value={operator} onChange={(event) => update({ operator: event.target.value })}>
          {FORMULA_OPERATORS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={right} onChange={(event) => update({ right: event.target.value })}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <div className={styles.wizardPreview}>
        <span>Resolved formula</span>
        <strong>{humanizeFormula(metric.formula || `${left} ${operator} ${right}`, metrics)}</strong>
        <small>{metric.formula || `${left} ${operator} ${right}`}</small>
      </div>
    </div>
  );
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
    <section className={styles.previewPanel}>
      <div className={styles.previewHeader}>
        <div className={styles.layoutMeta}>
          <span>Source preview</span>
          <strong>{preview.accountLabel || providerLabel(preview.provider)}</strong>
          <small>{preview.totalRows} fetched rows | updated {formatDateTime(preview.fetchedAt)}</small>
        </div>
        <div className={styles.previewFieldList}>
          {preview.fieldCatalog.slice(0, 8).map((field) => <span key={field} className={styles.previewFieldPill}>{field}</span>)}
        </div>
      </div>
      <div className={styles.previewToolbar}>
        <label className={styles.previewSearch}>
          <span>Search</span>
          <input type="text" value={filters.search ?? ""} onChange={(event) => onFilterChange("search", event.target.value)} placeholder="Search rows, fields, names, sources, or tags" />
        </label>
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
    </section>
  );
}

function DataPanel({ title, tableId, report }: { title: string; tableId: string; report: any }) {
  const section = resolveTable(tableId, report);
  return <Panel title={title} icon={<Database />}>{section.description ? <p className={styles.copy}>{section.description}</p> : null}<div className={styles.tableWrap}><table className={styles.table}><thead><tr>{section.columns.map((column: any) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{section.rows.length ? section.rows.map((row: any, index: number) => <tr key={`${row.id ?? row.jobId ?? row.name ?? row.source ?? index}`}>{section.columns.map((column: any) => <td key={column.key}>{formatCell(row[column.key], column.format)}</td>)}</tr>) : <tr><td colSpan={section.columns.length}>No rows yet.</td></tr>}</tbody></table></div></Panel>;
}

function DebugTablesPanel({ report }: { report: any }) {
  const tables = report?.debug?.tables ?? [];
  if (!tables.length) return null;

  return (
    <Panel title="Source Debug Tables" icon={<Database />}>
      <p className={styles.copy}>These tables show the raw and matched CRM rows used by the current live report so we can inspect why a job, lead, or revenue row did or did not make it into the dashboard.</p>
      <div className={styles.debugStack}>
        {tables.map((table: any) => (
          <details key={table.id} className={styles.debugDisclosure}>
            <summary className={styles.debugSummary}>
              <div className={styles.layoutMeta}>
                <span>{table.totalRows ?? table.rows?.length ?? 0} rows</span>
                <strong>{table.title}</strong>
                <small>{table.description}</small>
              </div>
            </summary>
            <div className={styles.previewPanel}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {(table.columns ?? []).map((column: any) => <th key={column.key}>{column.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(table.rows ?? []).length ? (
                      table.rows.map((row: any, index: number) => (
                        <tr key={`${table.id}-${row.id ?? row.jobId ?? row.leadId ?? row.matchKey ?? index}`}>
                          {(table.columns ?? []).map((column: any) => <td key={column.key}>{formatCell(row[column.key], column.format)}</td>)}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={(table.columns ?? []).length || 1}>No rows in this slice for the current report window.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        ))}
      </div>
    </Panel>
  );
}

function resolveTable(tableId: string, report: any) {
  if (tableId === "paid_channel_performance") return { description: "Spend, appointments, sold jobs, revenue, and efficiency by paid vendor alias.", rows: report.dashboard?.paidChannelPerformance ?? [], columns: [{ key: "name", label: "Name" }, { key: "spend", label: "Spend", format: "currency" }, { key: "leads", label: "Leads" }, { key: "issuedLeads", label: "Appointments" }, { key: "soldJobs", label: "Sold Jobs" }, { key: "revenue", label: "Revenue", format: "currency" }, { key: "costPerLead", label: "Cost / Lead", format: "currency" }, { key: "costPerIssuedLead", label: "Cost / Booked Appt", format: "currency" }, { key: "roas", label: "ROAS", format: "ratio" }, { key: "closeRate", label: "Close Rate", format: "percent" }] };
  if (tableId === "design_consultant_performance") return { description: "Appointments, sold jobs, and revenue output by design consultant.", rows: report.dashboard?.designConsultantPerformance ?? [], columns: [{ key: "designConsultant", label: "Design Consultant" }, { key: "appointments", label: "Appointments" }, { key: "soldJobs", label: "Sold Jobs" }, { key: "revenue", label: "Revenue", format: "currency" }, { key: "closeRate", label: "Close Rate", format: "percent" }, { key: "averageJobSize", label: "Avg Job Size", format: "currency" }, { key: "revenuePerAppointment", label: "Revenue / Appt", format: "currency" }] };
  if (tableId === "leads_by_source") return { description: "Source-level performance across leads, appointments, sold jobs, and revenue.", rows: report.dashboard?.leadsBySource ?? [], columns: [{ key: "source", label: "Source" }, { key: "leads", label: "Leads" }, { key: "issuedLeads", label: "Appointments" }, { key: "soldJobs", label: "Sold Jobs" }, { key: "revenue", label: "Revenue", format: "currency" }, { key: "closeRate", label: "Close Rate", format: "percent" }, { key: "netSalesPerLeadIssued", label: "NSLI", format: "currency" }] };
  if (tableId === "jobs_sold_detail") return { description: "Inline sold-job drilldown with attributed source, consultant, project manager, and time to close.", rows: report.dashboard?.jobsSoldDetail ?? [], columns: [{ key: "jobId", label: "Job ID" }, { key: "customer", label: "Customer" }, { key: "projectType", label: "Project Type" }, { key: "soldDate", label: "Sold Date" }, { key: "leadCreatedEastern", label: "Lead Created (ET)" }, { key: "timeToClose", label: "Time to Close" }, { key: "attributedSource", label: "Attributed Source" }, { key: "sourceBucket", label: "Source Bucket" }, { key: "designConsultant", label: "Design Consultant" }, { key: "projectManager", label: "Project Manager" }, { key: "revenue", label: "Revenue", format: "currency" }] };
  if (tableId === "closing_outcomes") return { description: "Regex-based closing outcome scan for appointments that did not sell.", rows: report.dashboard?.closingOutcomes ?? [], columns: [{ key: "reason", label: "Reason" }, { key: "jobs", label: "Jobs" }, { key: "examples", label: "Examples" }, { key: "description", label: "Description" }] };
  return { description: "Records that were not matched between CRM leads and jobs.", rows: [...((report.unmatched?.leads ?? []).slice(0, 50).map((lead: any) => ({ type: "lead", label: lead.name || lead.email || lead.id || "Unknown lead", reason: lead.reason || "Not matched" })) ?? []), ...((report.unmatched?.jobs ?? []).slice(0, 50).map((job: any) => ({ type: "job", label: job.jobNumber || job.customer || job.id || "Unknown job", reason: job.reason || "Not matched" })) ?? [])], columns: [{ key: "type", label: "Type" }, { key: "label", label: "Record" }, { key: "reason", label: "Reason" }] };
}

function defaultPreviewFilters(filters?: Array<{ key: string }>) {
  return (filters ?? []).reduce((result, filter) => {
    result[filter.key] = "";
    return result;
  }, { search: "" } as PreviewFilterState);
}

function defaultPreviewRequest(): PreviewRequestState {
  return { limit: "100", startDate: "", endDate: "" };
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
  return sections?.length ? sections : [];
}

function fromStoredReport(report: any, ruleSet: any) {
  if (!report) return null;
  return { reportId: report.id, createdAt: report.created_at, ruleSet, sourceSnapshot: report.source_snapshot ?? {}, totals: report.totals ?? {}, breakdowns: report.breakdowns ?? {}, executiveSummary: report.detail?.executiveSummary ?? [], configuredMetrics: report.detail?.configuredMetrics ?? [], unmatched: report.detail?.unmatched ?? {}, dashboard: report.detail?.dashboard ?? {}, debug: report.detail?.debug ?? null, comparison: report.detail?.comparison ?? null };
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

function clampPositiveInteger(value: string, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function parseLines(value: string) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function prettyLabel(value: string) {
  return String(value ?? "").replace(/_/g, " ").replace(/\b\w/g, (entry) => entry.toUpperCase());
}

function getFieldOptions(fieldCatalog: FieldCatalog, provider?: string, object?: string) {
  if (!provider || !object) return [];
  return fieldCatalog[provider]?.objects?.[object] ?? [];
}

function metricDatasetId(metric: any) {
  if (!metric?.provider || !metric?.object) return null;
  return `${metric.provider}.${metric.object}`;
}

function describeMetricDefinition(metric: any) {
  const base = metric.operation === "formula"
    ? `Formula: ${metric.formula || "Set a formula"}`
    : `${prettyLabel(metric.operation)} ${metric.field ? metric.field : "records"} from ${providerLabel(metric.provider)} ${prettyLabel(metric.object)}`;
  const date = metric.dateField ? ` | Date: ${metric.dateField}` : "";
  return `${base}${date}`;
}

function buildMetricInspector(metric: any) {
  return [metric.description, describeMetricDefinition(metric)].filter(Boolean).join("\n");
}

function parseFormulaExpression(formula?: string | null) {
  const match = String(formula ?? "").trim().match(/^([a-zA-Z0-9_]+)\s*([+\-*/])\s*([a-zA-Z0-9_]+)$/);
  if (!match) return null;
  return { left: match[1], operator: match[2], right: match[3] };
}

function humanizeFormula(formula: string, metrics: any[]) {
  const parsed = parseFormulaExpression(formula);
  if (!parsed) return formula || "Set a formula";
  const byId = Object.fromEntries(metrics.map((metric) => [metric.id, metric.name]));
  return `${byId[parsed.left] ?? parsed.left} ${parsed.operator} ${byId[parsed.right] ?? parsed.right}`;
}

function metricBandClassName(section: any) {
  const columns = Number(section?.columns ?? 4);
  const density = String(section?.density ?? "comfortable");
  const classes = [styles.metricBand];
  if (columns === 2) classes.push(styles.metricBand2);
  if (columns === 3) classes.push(styles.metricBand3);
  if (columns === 6) classes.push(styles.metricBand6);
  if (density === "compact") classes.push(styles.metricBandCompact);
  if (density === "editorial") classes.push(styles.metricBandEditorial);
  return classes.join(" ");
}
