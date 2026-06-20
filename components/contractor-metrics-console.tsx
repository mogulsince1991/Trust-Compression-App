"use client";

import Link from "next/link";
import { BarChart3, Database, Link2, Loader2, Plus, RefreshCw, Save, Settings2, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "./contractor-metrics-console.module.css";

type AnyRecord = Record<string, any>;

const TABS = [
  { id: "metrics", label: "Metrics", icon: BarChart3 },
  { id: "config", label: "Report Config", icon: Settings2 },
  { id: "connections", label: "Connections", icon: Link2 },
] as const;

const DEFAULT_SECTIONS = [
  { id: "executive_summary", title: "Executive Summary", kind: "summary", visible: true },
  { id: "scoreboard_financial", title: "Financial Scoreboard", kind: "metric_band", visible: true, metricIds: ["overall_spend", "paid_roas", "overall_revenue", "paid_revenue", "organic_revenue", "overall_nsli"] },
  { id: "scoreboard_pipeline", title: "Pipeline Scoreboard", kind: "metric_band", visible: true, metricIds: ["overall_leads", "paid_leads", "organic_leads", "overall_appointments", "paid_appointments", "organic_appointments"] },
  { id: "scoreboard_sales", title: "Sales Scoreboard", kind: "metric_band", visible: true, metricIds: ["overall_sold_jobs", "paid_sold_jobs", "organic_sold_jobs", "overall_close_rate", "paid_close_rate", "organic_close_rate"] },
  { id: "scoreboard_efficiency", title: "Efficiency Scoreboard", kind: "metric_band", visible: true, metricIds: ["cost_per_paid_lead", "cost_per_paid_appointment", "average_ticket", "paid_average_ticket", "organic_average_ticket", "average_time_to_close", "paid_average_time_to_close", "organic_average_time_to_close", "paid_nsli", "organic_nsli"] },
  { id: "paid_channel_performance", title: "Paid Channel Performance", kind: "table", visible: true, tableId: "paid_channel_performance" },
  { id: "design_consultant_performance", title: "Design Consultant Performance", kind: "table", visible: true, tableId: "design_consultant_performance" },
  { id: "leads_by_source", title: "Leads by Source", kind: "table", visible: true, tableId: "leads_by_source" },
  { id: "jobs_sold_detail", title: "Jobs Sold Detail", kind: "table", visible: true, tableId: "jobs_sold_detail" },
  { id: "closing_outcomes", title: "Why Jobs Aren't Closing", kind: "table", visible: true, tableId: "closing_outcomes" },
  { id: "unmatched_records", title: "Unmatched Records", kind: "table", visible: true, tableId: "unmatched_records" },
];

const EMPTY_GHL = { accountLabel: "GoHighLevel", privateIntegrationToken: "", locationId: "", externalAccountId: "", apiBaseUrl: "https://services.leadconnectorhq.com" };
const EMPTY_JOBTREAD = { accountLabel: "JobTread", apiToken: "", externalAccountId: "", apiBaseUrl: "https://api.jobtread.com" };
const EMPTY_WIZARD = { name: "", displayType: "currency", leftMetricId: "overall_revenue", operator: "/", rightMetricId: "overall_appointments", targetSectionId: "scoreboard_efficiency", description: "" };

export function ContractorMetricsConsole() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("metrics");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [fieldCatalog, setFieldCatalog] = useState<AnyRecord>({});
  const [ruleSets, setRuleSets] = useState<any[]>([]);
  const [selectedRuleSetId, setSelectedRuleSetId] = useState<string | null>(null);
  const [ruleSetDraft, setRuleSetDraft] = useState<any | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [clientName, setClientName] = useState("Trust Compression Contractor Report");
  const [startDate, setStartDate] = useState("2026-06-01");
  const [endDate, setEndDate] = useState("2026-06-30");
  const [ghl, setGhl] = useState(EMPTY_GHL);
  const [jobtread, setJobtread] = useState(EMPTY_JOBTREAD);
  const [wizard, setWizard] = useState(EMPTY_WIZARD);

  const activeReport = preview ?? fromStoredReport(reports[0] ?? null, ruleSetDraft);
  const metricMap = Object.fromEntries((activeReport?.configuredMetrics ?? []).map((m: any) => [m.id, m]));
  const comparisonMap = Object.fromEntries((activeReport?.comparison?.configuredMetrics ?? []).map((m: any) => [m.id, m]));
  const sections = normalizeSections(ruleSetDraft?.settings?.dashboardSections);
  const metricSections = sections.filter((section: any) => section.kind === "metric_band");

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

  async function refresh(nextWorkspaceId = workspaceId, token = session?.access_token) {
    if (!nextWorkspaceId || !token) return;
    setWorking((current) => current || "refresh");
    const [accountsResponse, configResponse, reportRows, sourceRows] = await Promise.all([
      fetch(`/api/connect/accounts?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/metrics/contractor/config?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, { headers: { Authorization: `Bearer ${token}` } }),
      supabase.from("contractor_reports").select("id,client_name,start_date,end_date,created_at,totals,breakdowns,detail,source_snapshot,rule_set_id").eq("workspace_id", nextWorkspaceId).order("created_at", { ascending: false }).limit(8),
      supabase.from("contractor_data_sources").select("id,provider,display_name,status,last_synced_at,last_error,updated_at").eq("workspace_id", nextWorkspaceId).order("updated_at", { ascending: false }),
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
      setNotice(state.startsWith("sync-") ? `Sync complete. Imported ${result.imported ?? 0}, updated ${result.updated ?? 0}, skipped ${result.skipped ?? 0}.` : "Saved successfully.");
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
      setNotice("Report generated from the current contractor template.");
      setTab("metrics");
      await refresh(workspaceId, session.access_token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not generate contractor report.");
    } finally {
      setWorking("");
    }
  }

  async function saveRuleSet() {
    if (!workspaceId || !session || !ruleSetDraft) return;
    setWorking("save-rule-set");
    setNotice("");
    setError("");
    try {
      const isExisting = Boolean(ruleSetDraft.id);
      const response = await fetch(isExisting ? `/api/metrics/contractor/config/${ruleSetDraft.id}` : "/api/metrics/contractor/config", {
        method: isExisting ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ workspaceId, ruleSet: ruleSetDraft }),
      });
      const result = await response.json();
      if (!response.ok || !result.ruleSet) throw new Error(result.error ?? "Could not save contractor report config.");
      setRuleSetDraft(clone(result.ruleSet));
      setSelectedRuleSetId(result.ruleSet.id ?? null);
      setNotice("Workspace report config saved.");
      await refresh(workspaceId, session.access_token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not save contractor report config.");
    } finally {
      setWorking("");
    }
  }

  function patchRuleSet(patch: AnyRecord) {
    setRuleSetDraft((current: any) => (current ? { ...current, ...patch } : current));
  }

  function patchSettings(patch: AnyRecord) {
    setRuleSetDraft((current: any) => (current ? { ...current, settings: { ...current.settings, ...patch } } : current));
  }

  function patchClassifications(key: string, value: any) {
    setRuleSetDraft((current: any) => (current ? { ...current, classifications: { ...current.classifications, [key]: value } } : current));
  }

  function duplicateRuleSet() {
    const base = clone(ruleSetDraft ?? ruleSets[0] ?? null);
    if (!base) return;
    base.id = undefined;
    base.isDefault = false;
    base.name = `${base.name} Copy`;
    base.slug = slugify(base.name);
    setSelectedRuleSetId(null);
    setRuleSetDraft(base);
    setNotice("Local copy created. Save it to persist.");
  }

  function updateSection(sectionId: string, patch: AnyRecord) {
    patchSettings({
      dashboardSections: sections.map((section: any) => (section.id === sectionId ? { ...section, ...patch } : section)),
    });
  }

  function moveSection(sectionId: string, direction: -1 | 1) {
    const next = [...sections];
    const index = next.findIndex((section: any) => section.id === sectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    patchSettings({ dashboardSections: next });
  }

  function setBucket(bucketValue: string, text: string) {
    patchClassifications("sourceBucket", {
      ...ruleSetDraft.classifications.sourceBucket,
      buckets: ruleSetDraft.classifications.sourceBucket.buckets.map((bucket: any) =>
        bucket.value === bucketValue ? { ...bucket, match: { ...bucket.match, patterns: toLines(text) } } : bucket
      ),
    });
  }

  function setVendorAliases(text: string) {
    patchClassifications(
      "paidVendorAliases",
      toLines(text).map((line) => {
        const [vendor, aliases] = line.split(":");
        return { vendor: vendor?.trim() || "Vendor", aliases: toCommaList(aliases ?? "") };
      })
    );
  }

  function setClosingOutcomes(text: string) {
    patchClassifications(
      "closingOutcomeRules",
      toLines(text).map((line, index) => {
        const [reason, pattern, description] = line.split("|");
        return { reason: reason?.trim() || `Reason ${index + 1}`, pattern: pattern?.trim() || "", description: description?.trim() || "" };
      })
    );
  }

  function addDerivedMetric() {
    if (!wizard.name.trim()) return;
    const id = slugify(wizard.name);
    if (ruleSetDraft.metricDefinitions.some((metric: any) => metric.id === id)) {
      setError("A metric with that name already exists.");
      return;
    }
    const metric = {
      id,
      name: wizard.name.trim(),
      source: "combined",
      provider: "combined",
      object: "matched_jobs",
      operation: "formula",
      field: null,
      dateField: null,
      conditions: [],
      formula: `${wizard.leftMetricId} ${wizard.operator} ${wizard.rightMetricId}`,
      displayType: wizard.displayType,
      currentOutputPath: null,
      description: wizard.description.trim() || wizardPreview(wizard, ruleSetDraft),
    };
    patchRuleSet({ metricDefinitions: [...ruleSetDraft.metricDefinitions, metric] });
    patchSettings({
      dashboardSections: sections.map((section: any) =>
        section.id === wizard.targetSectionId ? { ...section, metricIds: [...(section.metricIds ?? []), id] } : section
      ),
    });
    setWizard(EMPTY_WIZARD);
    setNotice("Derived metric added to the draft.");
  }

  function removeDerivedMetric(metricId: string) {
    patchRuleSet({ metricDefinitions: ruleSetDraft.metricDefinitions.filter((metric: any) => metric.id !== metricId) });
    patchSettings({
      dashboardSections: sections.map((section: any) => ({ ...section, metricIds: (section.metricIds ?? []).filter((id: string) => id !== metricId) })),
    });
  }

  if (loading) return <main className={styles.screen}><div className={styles.loadingBox}><Loader2 className={styles.spin} /><p className={styles.copy}>Loading contractor metrics workspace.</p></div></main>;
  if (!session) return <Gate title="Sign in to open contractor metrics." body="This reporting workspace uses your Trust Compression session plus server-side connected accounts." />;
  if (!workspaceId || !ruleSetDraft) return <Gate title="Workspace not ready." body={error || "We could not load the contractor metrics workspace right now."} />;

  const vendorAliasText = (ruleSetDraft.classifications.paidVendorAliases ?? []).map((entry: any) => `${entry.vendor}: ${(entry.aliases ?? []).join(", ")}`).join("\n");
  const closingOutcomeText = (ruleSetDraft.classifications.closingOutcomeRules ?? []).map((entry: any) => `${entry.reason} | ${entry.pattern} | ${entry.description}`).join("\n");
  const metricOptions = (ruleSetDraft.metricDefinitions ?? []).map((metric: any) => ({ value: metric.id, label: metric.name }));

  return (
    <main className={styles.screen}>
      <section className={styles.hero}>
        <span>Contractor Metrics</span>
        <h1>Owner-facing reporting with CRM-backed attribution defaults.</h1>
        <p>Run the contractor dashboard, tune attribution defaults without JSON, and keep GoHighLevel plus JobTread flowing into one reporting workspace.</p>
        <div className={styles.heroActions}>
          <Link href="/" className={styles.linkButton}>Open main app</Link>
          <button className={styles.primary} type="button" onClick={runReport} disabled={working === "report"}><Sparkles />{working === "report" ? "Generating..." : "Run contractor report"}</button>
          <button className={styles.secondary} type="button" onClick={() => refresh()} disabled={working === "refresh"}><RefreshCw />Refresh workspace</button>
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

      {tab === "metrics" ? (
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
                <Pill label="Comparison mode" value={ruleSetDraft.settings?.comparisonMode === "none" ? "None" : "Previous period"} />
              </div>
            </Panel>
          </section>

          {activeReport ? (
            <>
              <section className={styles.grid}>
                <Panel title="Executive Summary" icon={<Sparkles />}>
                  <div className={styles.summaryList}>{(activeReport.executiveSummary?.length ? activeReport.executiveSummary : ["Run the report to populate the owner summary."]).map((line: string, index: number) => <div key={`${index}-${line}`} className={styles.summaryRow}>{line}</div>)}</div>
                </Panel>
                <Panel title="Latest report snapshot" icon={<Database />}>
                  <div className={styles.reportList}>
                    <div className={styles.reportRow}><strong>{activeReport.ruleSet?.name ?? ruleSetDraft.name}</strong><small>{startDate} to {endDate}</small><small>Generated {formatDateTime(activeReport.createdAt)}</small></div>
                    <div className={styles.inlineStat}><span>Source rows</span><strong>{String(activeReport.sourceSnapshot?.leadRows ?? 0)} leads / {String(activeReport.sourceSnapshot?.jobRows ?? 0)} jobs / {String(activeReport.sourceSnapshot?.spendRows ?? 0)} spend</strong></div>
                  </div>
                </Panel>
              </section>

              {sections.filter((section: any) => section.visible !== false).map((section: any) => {
                if (section.kind === "summary") return null;
                if (section.kind === "metric_band") {
                  return <section key={section.id} className={styles.metricBand}><h2>{section.title}</h2><div className={styles.metricGrid}>{(section.metricIds ?? []).map((metricId: string) => <MetricCard key={metricId} label={metricMap[metricId]?.name ?? metricId} value={formatMetricValue(metricMap[metricId]?.value, metricMap[metricId]?.displayType ?? "number")} detail={metricMap[metricId]?.description ?? ""} delta={metricDelta(metricMap[metricId], comparisonMap[metricId])} />)}</div></section>;
                }
                return <DataPanel key={section.id} title={section.title} tableId={section.tableId} report={activeReport} />;
              })}
            </>
          ) : (
            <Panel title="Metrics" icon={<BarChart3 />}><p className={styles.copy}>Run the contractor report to populate the dashboard with KPI cards, grouped tables, and inline detail.</p></Panel>
          )}
        </div>
      ) : null}

      {tab === "config" ? (
        <div className={styles.stack}>
          <section className={styles.controlGrid}>
            <Panel title="Workspace report config" icon={<Settings2 />}>
              <div className={styles.formGrid}>
                <Field label="Template name" value={ruleSetDraft.name ?? ""} onChange={(value) => patchRuleSet({ name: value, slug: slugify(value) })} />
                <SelectField label="Comparison mode" value={ruleSetDraft.settings?.comparisonMode ?? "previous_period"} onChange={(value) => patchSettings({ comparisonMode: value })} options={[{ value: "previous_period", label: "Previous period" }, { value: "none", label: "None" }]} />
              </div>
              <div className={styles.actionRow}>
                <button className={styles.primary} type="button" onClick={saveRuleSet} disabled={working === "save-rule-set"}><Save />Save workspace config</button>
                <button className={styles.secondary} type="button" onClick={duplicateRuleSet}><Plus />Duplicate template</button>
              </div>
            </Panel>
            <Panel title="Shared attribution defaults" icon={<Database />}>
              <p className={styles.copy}>Source bucket mapping, paid vendor aliases, and closing outcome rules apply across the full contractor dashboard.</p>
            </Panel>
          </section>

          <section className={styles.grid}>
            <Panel title="Source bucket mapping" icon={<Database />}>
              <div className={styles.stack}>{["paid", "organic", "referral", "unmatched"].map((bucketValue) => <TextAreaField key={bucketValue} label={`${bucketValue[0].toUpperCase()}${bucketValue.slice(1)} patterns`} value={bucketPatterns(ruleSetDraft, bucketValue)} onChange={(value) => setBucket(bucketValue, value)} />)}</div>
            </Panel>
            <Panel title="Paid vendor aliases" icon={<Database />}>
              <TextAreaField label="Vendor aliases" value={vendorAliasText} onChange={setVendorAliases} />
            </Panel>
            <Panel title="Closing outcome rules" icon={<Database />}>
              <TextAreaField label="Closing outcomes" value={closingOutcomeText} onChange={setClosingOutcomes} />
            </Panel>
          </section>

          <section className={styles.grid}>
            <Panel title="Dashboard sections" icon={<Settings2 />}>
              <div className={styles.sectionList}>
                {sections.map((section: any, index: number) => (
                  <article key={section.id} className={styles.sectionRow}>
                    <div>
                      <strong>{section.title}</strong>
                      <small>{section.kind === "metric_band" ? "Metric band" : section.kind === "table" ? section.tableId : "Summary"}</small>
                    </div>
                    <div className={styles.sectionActions}>
                      <label className={styles.toggle}><input type="checkbox" checked={section.visible !== false} onChange={(event) => updateSection(section.id, { visible: event.target.checked })} /><span>Visible</span></label>
                      <button className={styles.ghost} type="button" disabled={index === 0} onClick={() => moveSection(section.id, -1)}>Up</button>
                      <button className={styles.ghost} type="button" disabled={index === sections.length - 1} onClick={() => moveSection(section.id, 1)}>Down</button>
                    </div>
                  </article>
                ))}
              </div>
            </Panel>
            <Panel title="Derived metric wizard" icon={<Sparkles />}>
              <div className={styles.wizardPreview}><span>Formula preview</span><strong>{wizardPreview(wizard, ruleSetDraft)}</strong><small>Curated formulas only in v1.</small></div>
              <div className={styles.formGrid}>
                <Field label="Metric name" value={wizard.name} onChange={(value) => setWizard((current) => ({ ...current, name: value }))} />
                <SelectField label="Display type" value={wizard.displayType} onChange={(value) => setWizard((current) => ({ ...current, displayType: value }))} options={[{ value: "currency", label: "Currency" }, { value: "number", label: "Number" }, { value: "percent", label: "Percent" }, { value: "ratio", label: "Ratio" }, { value: "days", label: "Days" }]} />
                <SelectField label="Left metric" value={wizard.leftMetricId} onChange={(value) => setWizard((current) => ({ ...current, leftMetricId: value }))} options={metricOptions} />
                <SelectField label="Operator" value={wizard.operator} onChange={(value) => setWizard((current) => ({ ...current, operator: value }))} options={[{ value: "+", label: "+" }, { value: "-", label: "-" }, { value: "*", label: "*" }, { value: "/", label: "/" }]} />
                <SelectField label="Right metric" value={wizard.rightMetricId} onChange={(value) => setWizard((current) => ({ ...current, rightMetricId: value }))} options={metricOptions} />
                <SelectField label="Target section" value={wizard.targetSectionId} onChange={(value) => setWizard((current) => ({ ...current, targetSectionId: value }))} options={metricSections.map((section: any) => ({ value: section.id, label: section.title }))} />
                <TextAreaField label="Human-readable description" value={wizard.description} onChange={(value) => setWizard((current) => ({ ...current, description: value }))} />
              </div>
              <div className={styles.actionRow}><button className={styles.primary} type="button" onClick={addDerivedMetric}><Plus />Add derived metric</button></div>
            </Panel>
          </section>

          <Panel title="Metric catalog" icon={<Database />}>
            <div className={styles.catalogGrid}>
              {(ruleSetDraft.metricDefinitions ?? []).map((metric: any) => {
                const removable = metric.operation === "formula" && !metric.currentOutputPath;
                return <div key={metric.id} className={styles.catalogCard}><strong>{metric.name}</strong><small>{metric.id}</small><p className={styles.copy}>{metric.description || metric.formula || `${metric.provider}.${metric.object}`}</p>{removable ? <div className={styles.actionRow}><button className={styles.ghost} type="button" onClick={() => removeDerivedMetric(metric.id)}><Trash2 />Remove</button></div> : null}</div>;
              })}
            </div>
          </Panel>
        </div>
      ) : null}

      {tab === "connections" ? (
        <div className={styles.stack}>
          <section className={styles.grid}>
            <ConnectionCard title="GoHighLevel private integration" description="Save a GoHighLevel private integration token server-side, then sync leads and source data into this workspace.">
              <form className={styles.formGrid} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void postAction("/api/connect/ghl", "connect-ghl", { workspaceId, accountLabel: ghl.accountLabel, privateIntegrationToken: ghl.privateIntegrationToken, locationId: ghl.locationId, externalAccountId: ghl.externalAccountId || undefined, apiBaseUrl: ghl.apiBaseUrl }); setGhl((current) => ({ ...current, privateIntegrationToken: "" })); }}>
                <Field label="Account label" value={ghl.accountLabel} onChange={(value) => setGhl((current) => ({ ...current, accountLabel: value }))} />
                <Field label="Location ID" value={ghl.locationId} onChange={(value) => setGhl((current) => ({ ...current, locationId: value }))} />
                <Field label="External account ID" value={ghl.externalAccountId} onChange={(value) => setGhl((current) => ({ ...current, externalAccountId: value }))} />
                <Field label="API base URL" value={ghl.apiBaseUrl} onChange={(value) => setGhl((current) => ({ ...current, apiBaseUrl: value }))} />
                <Field label="Private integration token" type="password" value={ghl.privateIntegrationToken} onChange={(value) => setGhl((current) => ({ ...current, privateIntegrationToken: value }))} />
                <button className={styles.primary} type="submit" disabled={working === "connect-ghl"}><Save />Save GoHighLevel account</button>
              </form>
            </ConnectionCard>
              <ConnectionCard title="JobTread grant key" description="Store a JobTread Open API grant key server-side, then sync jobs into the same reporting workspace. This is not your JobTread password.">
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
                {accounts.length ? accounts.map((account) => <article key={account.id} className={styles.accountCard}><div className={styles.accountHeader}><div className={styles.accountSummary}><strong>{account.accountLabel || providerLabel(account.provider)}</strong><small>{providerLabel(account.provider)}</small></div><div className={styles.accountMeta}><span>{account.status}</span>{account.expiresAt ? <span>Expires {formatDateTime(account.expiresAt)}</span> : null}</div></div><p className={styles.copy}>{describeAccount(account)}</p><div className={styles.actionRow}><button className={styles.secondary} type="button" disabled={working === `sync-${account.id}`} onClick={() => postAction("/api/metrics/contractor/sync", `sync-${account.id}`, { workspaceId, connectedAccountId: account.id })}><RefreshCw />Sync now</button></div></article>) : <p className={styles.empty}>No connected accounts yet.</p>}
              </div>
            </Panel>
            <Panel title={`Normalized sources (${sources.length})`} icon={<Database />}>
              <div className={styles.sourceList}>
                {sources.length ? sources.map((source) => <article key={source.id} className={styles.sourceRow}><div><span>{providerLabel(source.provider)}</span><strong>{source.display_name}</strong></div><div className={styles.sourceMeta}><small>{source.status}</small><small>Last synced {formatDateTime(source.last_synced_at || source.updated_at)}</small>{source.last_error ? <small className={styles.rowError}>{source.last_error}</small> : null}</div></article>) : <p className={styles.empty}>No normalized sources yet. Connect an account and run a sync.</p>}
              </div>
            </Panel>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Gate({ title, body }: { title: string; body: string }) {
  return <main className={styles.screen}><section className={styles.hero}><span>Contractor Metrics</span><h1>{title}</h1><p>{body}</p><div className={styles.heroActions}><Link href="/" className={styles.linkButton}>Open main app</Link></div></section></main>;
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className={styles.panel}><div className={styles.panelHead}><span>{title}</span>{icon}</div>{children}</section>;
}

function ConnectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className={styles.panel}><div className={styles.panelHead}><span>{title}</span><Link2 /></div><p className={styles.copy}>{description}</p>{children}</section>;
}

function Pill({ label, value }: { label: string; value: string }) {
  return <div className={styles.statusPill}><span>{label}</span><strong>{value}</strong></div>;
}

function MetricCard({ label, value, detail, delta }: { label: string; value: string; detail: string; delta?: string | null }) {
  return <div className={styles.metricCard}><span>{label}</span><strong>{value}</strong><small>{detail}</small>{delta ? <em>{delta}</em> : null}</div>;
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

function fromStoredReport(report: any, ruleSet: any) {
  if (!report) return null;
  return { reportId: report.id, createdAt: report.created_at, ruleSet, sourceSnapshot: report.source_snapshot ?? {}, totals: report.totals ?? {}, breakdowns: report.breakdowns ?? {}, executiveSummary: report.detail?.executiveSummary ?? [], configuredMetrics: report.detail?.configuredMetrics ?? [], unmatched: report.detail?.unmatched ?? {}, dashboard: report.detail?.dashboard ?? {}, comparison: report.detail?.comparison ?? null };
}

function normalizeSections(sections?: any[]) {
  if (!sections?.length) return clone(DEFAULT_SECTIONS);
  const incoming = new Map(sections.map((section) => [section.id, section]));
  const merged = DEFAULT_SECTIONS.map((section) => ({ ...section, ...(incoming.get(section.id) ?? {}) }));
  for (const extra of sections) if (!merged.some((section) => section.id === extra.id)) merged.push(extra);
  return merged;
}

function bucketPatterns(ruleSet: any, bucketValue: string) {
  return ruleSet?.classifications?.sourceBucket?.buckets?.find((bucket: any) => bucket.value === bucketValue)?.match?.patterns?.join("\n") ?? "";
}

function wizardPreview(wizard: any, ruleSet: any) {
  const label = (metricId: string) => ruleSet?.metricDefinitions?.find((metric: any) => metric.id === metricId)?.name ?? metricId;
  return `${label(wizard.leftMetricId)} ${wizard.operator} ${label(wizard.rightMetricId)}`;
}

function metricDelta(current?: any, previous?: any) {
  const a = Number(current?.value);
  const b = Number(previous?.value);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const delta = a - b;
  if (Math.abs(delta) < 0.00001) return "Flat vs previous period";
  return `${delta > 0 ? "+" : ""}${formatMetricValue(delta, current?.displayType ?? "number", true)} vs previous period`;
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
