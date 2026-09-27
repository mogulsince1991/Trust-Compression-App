"use client";

import { useEffect, useState } from "react";
import { parseSpendCsv, validateSpendRows } from "@/lib/metrics/contractor/spend-input";
import styles from "./contractor-metrics-console.module.css";

export function ContractorSpend({ workspaceId, token }: { workspaceId: string; token: string }) {
  const [month, setMonth] = useState(() => { const parts = new Intl.DateTimeFormat("en", { timeZone: "America/New_York", year: "numeric", month: "2-digit" }).formatToParts(new Date()); return `${parts.find(part => part.type === "year")!.value}-${parts.find(part => part.type === "month")!.value}`; });
  const [rows, setRows] = useState<any[]>([]), [pending, setPending] = useState<any[]>([]);
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [canEdit, setCanEdit] = useState(false), [revision, setRevision] = useState(0);
  const [entry, setEntry] = useState({ date: "", vendor: "", spend: "", sourceFile: "" });
  useEffect(() => {
    const controller = new AbortController();
    setRows([]); setPending([]); setCanEdit(false);
    fetch(`/api/metrics/contractor/spend?workspaceId=${encodeURIComponent(workspaceId)}&month=${month}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); if (!controller.signal.aborted) { setRows(result.rows); setCanEdit(result.canEdit); } })
      .catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [workspaceId, month, token, revision]);
  async function save(importRows: any[], documentName: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/metrics/contractor/spend", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, month, rows: importRows, documentName }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setPending([]); setRevision(value => value + 1);
      setEntry({ date: "", vendor: "", spend: "", sourceFile: "" });
      setMessage(`${result.added} rows added; ${result.skipped} identical rows skipped. Run a new report to use the updated spend.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save spend."); }
    finally { setBusy(false); }
  }
  async function remove(row: any) {
    if (!window.confirm(`Remove ${row.vendor} spend of $${row.spend} on ${row.spend_date}?`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/metrics/contractor/spend", { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, id: row.id }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setRevision(value => value + 1);
    } catch (error) { setMessage(String(error)); } finally { setBusy(false); }
  }
  function template() {
    const url = URL.createObjectURL(new Blob([`Date,Vendor,Spend,Channel,Campaign,Document URL\n${month}-01,Google Ads,1000,Paid search,,\n`], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = "marketing-spend-template.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className={styles.previewPanel} aria-label="Monthly marketing spend">
    <h2>Monthly marketing spend</h2>
    <p>Add each month's marketing costs here. Import a spreadsheet saved as CSV, or enter a cost and link its invoice, PDF, or Google Sheet. Links are supporting documents; only the amounts below count toward reports.</p>
    <div className={styles.actionRow}><label>Month <input type="month" value={month} disabled={busy} onChange={event => { if (event.target.value) setMonth(event.target.value); }} /></label><strong>{rows.reduce((sum, row) => sum + Number(row.spend), 0).toLocaleString("en-US", { style: "currency", currency: "USD" })} saved</strong></div>
    <p>Use the actual expense date. Partial-period reports include only costs dated within that period; monthly totals are not automatically prorated.</p>
    {canEdit && <>
      <div className={styles.actionRow}><button type="button" onClick={template}>Download CSV template</button><label>Import spend CSV <input type="file" accept=".csv,text/csv" disabled={busy} onChange={async event => {
        const file = event.target.files?.[0]; if (!file) return;
        setPending([]); setMessage("");
        try { if (file.size > 2_000_000) throw new Error("Use a CSV smaller than 2 MB."); const parsed = parseSpendCsv(await file.text(), month); setPending(parsed); setName(file.name); }
        catch (error) { setMessage(error instanceof Error ? error.message : "Could not read CSV."); }
        event.target.value = "";
      }} /></label></div>
      {pending.length > 0 && <div className={styles.previewPanel}><strong>{name}: {pending.length} rows ready</strong><div style={{ overflowX: "auto", maxHeight: 240 }}><table><thead><tr><th>Date</th><th>Vendor</th><th>Amount</th></tr></thead><tbody>{pending.map((row, index) => <tr key={index}><td>{row.date}</td><td>{row.vendor}</td><td>{row.spend}</td></tr>)}</tbody></table></div><button disabled={busy} onClick={() => void save(pending, name)}>Confirm import</button><button disabled={busy} onClick={() => setPending([])}>Cancel</button></div>}
      <form className={styles.formGrid} onSubmit={event => { event.preventDefault(); try { void save(validateSpendRows([entry], month), "Manual entry"); } catch (error) { setMessage(String(error)); } }}>
        <label>Date<input type="date" required value={entry.date} onChange={e => setEntry({ ...entry, date: e.target.value })} /></label>
        <label>Vendor / channel<input required placeholder="Google Ads, Meta, agency fee..." value={entry.vendor} onChange={e => setEntry({ ...entry, vendor: e.target.value })} /></label>
        <label>Amount ($)<input type="number" step="0.01" required value={entry.spend} onChange={e => setEntry({ ...entry, spend: e.target.value })} /></label>
        <label>Supporting document link (optional)<input type="url" placeholder="https://drive.google.com/..." value={entry.sourceFile} onChange={e => setEntry({ ...entry, sourceFile: e.target.value })} /></label>
        <button type="submit" disabled={busy}>Add spend</button>
      </form>
      <small>Identical repeat imports are skipped. For a corrected file, remove its old rows before importing the replacement. PDFs and spreadsheets stay with their original host.</small>
    </>}
    {message && <p role="status">{message}</p>}
    <div style={{ overflowX: "auto" }}><table><thead><tr><th>Date</th><th>Vendor</th><th>Amount</th><th>Document</th><th>Actions</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.spend_date}</td><td>{row.vendor}</td><td>{Number(row.spend).toLocaleString("en-US", { style: "currency", currency: "USD" })}</td><td>{/^https:\/\//i.test(row.source_file ?? "") ? <a href={row.source_file} target="_blank" rel="noopener noreferrer">Open document</a> : row.raw?.documentName || row.source_file || "Manual entry"}</td><td>{canEdit && <button disabled={busy} onClick={() => void remove(row)} aria-label={`Remove ${row.vendor} on ${row.spend_date}`}>Remove</button>}</td></tr>)}</tbody></table>{!rows.length && <p>No spend recorded for this month.</p>}</div>
  </section>;
}
