"use client";

import Link from "next/link";
import { BarChart3, Check, Database, Loader2, Play, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "./contractor-metrics-console.module.css";

const samplePayload = {
  provider: "manual",
  displayName: "Smoke Test Contractor Data",
  externalAccountId: "smoke-test-contractor",
  leads: [
    {
      id: "lead-1",
      name: "Avery Johnson",
      email: "avery@example.com",
      phone: "555-0101",
      source: "Google Ads",
      campaign: "google ads - bathroom remodel",
      createdDate: "2026-06-04T10:30:00-04:00",
      tags: "qualified"
    },
    {
      id: "lead-2",
      name: "Morgan Smith",
      email: "morgan@example.com",
      phone: "555-0102",
      source: "Referral",
      campaign: "organic referral",
      createdDate: "2026-06-06T09:00:00-04:00",
      tags: "qualified"
    }
  ],
  jobs: [
    {
      jobNumber: "JT-1001",
      customer: "Avery Johnson",
      email: "avery@example.com",
      phone: "555-0101",
      appointmentDate: "2026-06-05T14:00:00-04:00",
      soldDate: "2026-06-08T11:00:00-04:00",
      status: "Sold",
      projectType: "Bathroom Remodel",
      revenue: "18000",
      netSales: "18000",
      designConsultant: "Taylor Consultant",
      source: "Google Ads",
      campaign: "google ads - bathroom remodel"
    },
    {
      jobNumber: "JT-1002",
      customer: "Morgan Smith",
      email: "morgan@example.com",
      phone: "555-0102",
      appointmentDate: "2026-06-09T13:00:00-04:00",
      status: "No Sale",
      projectType: "Windows",
      revenue: "0",
      designConsultant: "Taylor Consultant",
      source: "Referral",
      campaign: "organic referral",
      notesSummary: "Customer said price was too high and wanted to wait until next year."
    }
  ],
  spendRows: [
    {
      Date: "2026-06-03",
      Vendor: "Google",
      Channel: "Paid Search",
      Campaign: "google ads - bathroom remodel",
      Spend: "1200",
      Leads: "2"
    },
    {
      Date: "2026-06-05",
      Vendor: "FaceBook",
      Channel: "Meta Ads",
      Campaign: "facebook ads - siding",
      Spend: "800",
      Leads: "1"
    }
  ]
};

type ReportRow = {
  id: string;
  client_name: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
  totals: Record<string, number | string | null> | null;
};

export function ContractorMetricsConsole() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [payloadText, setPayloadText] = useState(JSON.stringify(samplePayload, null, 2));
  const [clientName, setClientName] = useState("Smoke Test Contractor");
  const [startDate, setStartDate] = useState("2026-06-01");
  const [endDate, setEndDate] = useState("2026-06-30");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"ingest" | "report" | "refresh" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [latestReport, setLatestReport] = useState<Record<string, any> | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [sourceCount, setSourceCount] = useState(0);

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
        setReports([]);
        setLatestReport(null);
        setSourceCount(0);
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
        workspace_name: "Trust Library"
      });

      if (!active) return;
      if (workspaceError || !data) {
        setError(workspaceError?.message ?? "Could not open the workspace.");
        setLoading(false);
        return;
      }

      setWorkspaceId(data);
      await refreshWorkspace(data);
      if (active) setLoading(false);
    }

    void openWorkspace();
    return () => {
      active = false;
    };
  }, [session, supabase]);

  async function refreshWorkspace(nextWorkspaceId = workspaceId) {
    if (!supabase || !nextWorkspaceId) return;
    setWorking("refresh");

    const [{ data: reportRows }, { count }] = await Promise.all([
      supabase
        .from("contractor_reports")
        .select("id,client_name,start_date,end_date,created_at,totals")
        .eq("workspace_id", nextWorkspaceId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("contractor_data_sources")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", nextWorkspaceId)
    ]);

    setReports((reportRows ?? []) as ReportRow[]);
    setSourceCount(count ?? 0);
    setWorking(null);
  }

  async function runIngest() {
    if (!session || !workspaceId) return;
    setWorking("ingest");
    setNotice("");
    setError("");

    try {
      const parsed = JSON.parse(payloadText) as Record<string, unknown>;
      const response = await fetch("/api/metrics/contractor/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          workspaceId,
          provider: "manual",
          displayName: "Manual contractor metrics import",
          ...parsed
        })
      });
      const result = (await response.json()) as { imported?: number; updated?: number; skipped?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not ingest contractor data.");
      setNotice(`Saved contractor rows. Imported ${result.imported ?? 0}, updated ${result.updated ?? 0}, skipped ${result.skipped ?? 0}.`);
      await refreshWorkspace(workspaceId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not ingest contractor data.");
    } finally {
      setWorking(null);
    }
  }

  async function generateReport() {
    if (!session || !workspaceId) return;
    setWorking("report");
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/metrics/contractor/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          workspaceId,
          startDate,
          endDate,
          clientName
        })
      });
      const result = (await response.json()) as Record<string, any>;
      if (!response.ok) throw new Error(String(result.error ?? "Could not generate contractor report."));
      setLatestReport(result);
      setNotice("Report generated and saved to Supabase.");
      await refreshWorkspace(workspaceId);
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
        body="Open the main app, sign in, then come back here. This page uses your existing Supabase session to test the authenticated contractor metrics routes."
      />
    );
  }

  return (
    <main className={styles.screen}>
      <section className={styles.hero}>
        <span>Contractor Metrics</span>
        <h1>Use the real app session to test ingest and reporting.</h1>
        <p>
          This page solves the two friction points from the last step: authenticated route testing, and a usable in-app place to push contractor data into the preserved metrics engine.
        </p>
        <div className={styles.heroActions}>
          <Link href="/" className={styles.linkButton}>
            Back to library
          </Link>
          <button className={styles.linkButton} onClick={() => setPayloadText(JSON.stringify(samplePayload, null, 2))}>
            Load sample payload
          </button>
        </div>
      </section>

      {(notice || error) && <p className={error ? styles.error : styles.notice}>{error || notice}</p>}

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <span>What you need to do</span>
            <Check />
          </div>
          <ol className={styles.steps}>
            <li>Stay signed in to `trustcompression.unmarked.media`.</li>
            <li>Leave the sample payload as-is for the first run, or replace it with your own normalized lead, job, and spend rows.</li>
            <li>Click `Save rows to workspace`.</li>
            <li>Click `Generate report`.</li>
            <li>Confirm the saved report appears below with spend, revenue, ROAS, and close rate.</li>
          </ol>
          <div className={styles.kpis}>
            <MetricCard label="Workspace" value={workspaceId ? "ready" : "missing"} />
            <MetricCard label="Sources" value={String(sourceCount)} />
            <MetricCard label="Saved reports" value={String(reports.length)} />
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <span>Report settings</span>
            <BarChart3 />
          </div>
          <div className={styles.formGrid}>
            <label>
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
            <button className={styles.primary} disabled={Boolean(working)} onClick={runIngest}>
              {working === "ingest" ? <Loader2 className={styles.spin} /> : <Database />}
              Save rows to workspace
            </button>
            <button className={styles.secondary} disabled={Boolean(working)} onClick={generateReport}>
              {working === "report" ? <Loader2 className={styles.spin} /> : <Play />}
              Generate report
            </button>
            <button className={styles.ghost} disabled={Boolean(working)} onClick={() => refreshWorkspace()}>
              {working === "refresh" ? <Loader2 className={styles.spin} /> : <RefreshCw />}
              Refresh
            </button>
          </div>
        </article>
      </section>

      <section className={styles.payloadPanel}>
        <div className={styles.panelHead}>
          <span>Ingest payload</span>
          <Database />
        </div>
        <textarea
          className={styles.payload}
          value={payloadText}
          onChange={(event) => setPayloadText(event.target.value)}
          spellCheck={false}
        />
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <span>Latest generated report</span>
            <BarChart3 />
          </div>
          {latestReport ? (
            <div className={styles.reportSummary}>
              <MetricCard label="Spend" value={money(latestReport.totals?.spend)} />
              <MetricCard label="Revenue" value={money(latestReport.totals?.revenue)} />
              <MetricCard label="ROAS" value={ratio(latestReport.totals?.roas)} />
              <MetricCard label="Close rate" value={percent(latestReport.totals?.closeRate)} />
            </div>
          ) : (
            <p className={styles.empty}>Generate a report to see the latest saved snapshot.</p>
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metricCard}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
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
