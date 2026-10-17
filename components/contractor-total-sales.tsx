"use client";

import styles from "./contractor-metrics-console.module.css";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useState } from "react";

const columns = [
  ["documentNumber", "Document"], ["customerName", "Customer"], ["documentDate", "Document date"],
  ["approvalDate", "Recognized (ET)"], ["amount", "Sold amount"], ["amountBreakdown", "Components"],
  ["documentCount", "Document count"], ["jobStatus", "Job status"], ["consultant", "Consultant"], ["setter", "Setter"], ["source", "Source"],
];
const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ContractorTotalSales({ report }: { report: any }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const sales = report.breakdowns?.totalSalesReport;
  if (!sales) return null;
  return <section className={styles.previewPanel} aria-label="Total Sales">
    {report.startDate && report.endDate ? <div className={styles.reportRow} aria-label="Report date range">
      <strong>Start date: <time dateTime={report.startDate}>{report.startDate}</time></strong>
      <strong>End date: <time dateTime={report.endDate}>{report.endDate}</time></strong>
    </div> : null}
    <h2>Total Sales</h2>
    <p>API-generated · Document-authoritative · Recognition dates in Eastern time</p>
    <div className={styles.statusStrip}>
      <span>Gross: <strong>{money(sales.gross.total)}</strong> · {sales.gross.count} sales rows · {sales.gross.documentCount} documents</span>
      <span>Net: <strong>{money(sales.net.total)}</strong> · {sales.net.count} sales rows · {sales.net.jobs} jobs</span>
    </div>
    <button type="button" className={styles.secondary} disabled={downloading} onClick={async () => {
      setDownloading(true); setDownloadError("");
      try {
        let datasets = report.exportDatasets;
        if (!datasets && report.reportId) {
          const client = createBrowserSupabaseClient();
          if (!client) throw Error("Sign in to download datasets.");
          const { data, error } = await client.from("contractor_reports").select("datasets:detail->exportDatasets").eq("id", report.reportId).single();
          if (error) throw error;
          datasets = data?.datasets;
        }
        downloadReport({ ...report, exportDatasets: datasets });
      } catch { setDownloadError("Could not download datasets. Please try again."); }
      finally { setDownloading(false); }
    }}>{downloading ? "Preparing download..." : "Download all report datasets"}</button>
    {downloadError && <p role="alert">{downloadError}</p>}
    <div style={{ overflowX: "auto" }}><table>
      <thead><tr>{columns.map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead>
      <tbody>{sales.rows.map((row: any, index: number) => <tr key={`${row.jobId}-${row.documentId}-${index}`}>
        {columns.map(([key]) => <td key={key}>{key === "amount" ? money(row.amount) : String(row[key] ?? "")}</td>)}
      </tr>)}</tbody>
    </table></div>
    <small>Gross retains qualifying canceled sales. Net excludes them. Job Sold Date does not determine these totals.</small>
  </section>;
}

function downloadReport(report: any) {
  const datasets = report.exportDatasets ?? { totalSales: report.breakdowns.totalSalesReport.rows };
  const escape = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  const sheets = Object.entries(datasets).map(([name, value], index) => {
    const rows: any[] = Array.isArray(value) ? value : [value];
    const keys = Array.from(new Set(rows.flatMap(row => row && typeof row === "object" ? Object.keys(row) : ["value"])));
    const cells = [keys, ...rows.map(row => keys.map(key => typeof row?.[key] === "object" ? JSON.stringify(row[key]) : row?.[key] ?? ""))];
    return `<Worksheet ss:Name="${escape(`${index + 1} ${name}`.slice(0, 31))}"><Table>${cells.map(row => `<Row>${row.map(cell => `<Cell><Data ss:Type="String">${escape(cell)}</Data></Cell>`).join("")}</Row>`).join("")}</Table></Worksheet>`;
  });
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheets.join("")}</Workbook>`;
  const url = URL.createObjectURL(new Blob([xml], { type: "application/vnd.ms-excel" }));
  const link = document.createElement("a"); link.href = url; link.download = "contractor-document-sales.xml"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
