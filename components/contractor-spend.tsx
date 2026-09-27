"use client";

import { useEffect, useState, useRef } from "react";
import type { WorkBook } from "xlsx";
import { parseSpendCsv, validateSpendRows, spendMonths } from "@/lib/metrics/contractor/spend-input";
import styles from "./contractor-metrics-console.module.css";
import { ContractorSpendLedger } from "./contractor-spend-ledger";

export function ContractorSpend({ workspaceId, token }: { workspaceId: string; token: string }) {
  const [month, setMonth] = useState(() => { const parts = new Intl.DateTimeFormat("en", { timeZone: "America/New_York", year: "numeric", month: "2-digit" }).formatToParts(new Date()); return `${parts.find(part => part.type === "year")!.value}-${parts.find(part => part.type === "month")!.value}`; });
  const [rows, setRows] = useState<any[]>([]), [pending, setPending] = useState<any[]>([]);
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [canEdit, setCanEdit] = useState(false), [revision, setRevision] = useState(0);
  const [entry, setEntry] = useState({ date: "", vendor: "", spend: "", sourceFile: "" });
  const [workbook, setWorkbook] = useState<WorkBook | null>(null);
  const [sheets, setSheets] = useState<string[]>([]), [sheetName, setSheetName] = useState("");
  const [reading, setReading] = useState(false);
  const importRequest = useRef(0);
  const [allMonths, setAllMonths] = useState(false), [loadingRows, setLoadingRows] = useState(true);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [optionalFields, setOptionalFields] = useState(["channel", "campaign", "sourceFile"]);
  const detectedMonths = spendMonths(pending.filter((_, index) => !excluded.includes(index)));
  const detectedMonth = detectedMonths.length === 1 ? detectedMonths[0] : "";
  useEffect(() => { if (detectedMonth) { setMonth(detectedMonth); setMessage(""); } }, [detectedMonth]);
  useEffect(() => { setExcluded([]); }, [pending]);
  useEffect(() => {
    setPending([]); setWorkbook(null); setSheets([]); setSheetName(""); importRequest.current++; setReading(false);
    return () => { importRequest.current++; };
  }, [workspaceId]);
  useEffect(() => {
    const controller = new AbortController();
    setRows([]); setCanEdit(false); setLoadingRows(true);
    fetch(`/api/metrics/contractor/spend?workspaceId=${encodeURIComponent(workspaceId)}&month=${allMonths ? "all" : month}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); if (!controller.signal.aborted) { setRows(result.rows); setCanEdit(result.canEdit); } })
      .catch(error => { if (!controller.signal.aborted) setMessage(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingRows(false); });
    return () => controller.abort();
  }, [workspaceId, month, token, revision, allMonths]);
  async function chooseSheet(book: WorkBook, selected: string) {
    const request = ++importRequest.current;
    setSheetName(selected); setPending([]); setMessage(""); setReading(true);
    try {
      const { parseSpendSheet } = await import("@/lib/metrics/contractor/spend-excel");
      const parsed = parseSpendSheet(book, selected, month, false);
      if (request === importRequest.current) setPending(parsed);
    } catch (error) { if (request === importRequest.current) setMessage(error instanceof Error ? error.message : "Could not read worksheet."); }
    finally { if (request === importRequest.current) setReading(false); }
  }
  async function readFile(file: File) {
    const request = ++importRequest.current;
    setPending([]); setWorkbook(null); setSheets([]); setSheetName(""); setMessage(""); setReading(true);
    try {
      if (file.size > 5_000_000) throw new Error("Use a CSV or Excel file smaller than 5 MB.");
      if (/\.csv$/i.test(file.name)) {
        const parsed = parseSpendCsv(await file.text(), month, false);
        if (request === importRequest.current) { setName(file.name); setPending(parsed); }
      } else if (/\.xlsx?$/i.test(file.name)) {
        const { readSpendWorkbook } = await import("@/lib/metrics/contractor/spend-excel");
        const result = readSpendWorkbook(await file.arrayBuffer());
        if (request !== importRequest.current) return;
        setName(file.name); setWorkbook(result.workbook); setSheets(result.sheets);
        if (result.sheets.length === 1) await chooseSheet(result.workbook, result.sheets[0]);
        else setMessage("Choose the worksheet to preview. Nothing has been saved yet.");
      } else throw new Error("Choose a .csv, .xlsx or .xls file.");
    } catch (error) { if (request === importRequest.current) setMessage(error instanceof Error ? error.message : "Could not read spreadsheet. Check that it is not password-protected."); }
    finally { if (request === importRequest.current) setReading(false); }
  }
  async function save(importRows: any[], documentName: string) {
    setBusy(true); setMessage("");
    try {
      const importMonths = spendMonths(importRows);
      if (documentName !== "Manual entry" && importMonths.length > 1) throw new Error(`This selection spans ${importMonths.join(", ")}. Select rows for one month at a time. No rows were saved.`);
      const saveMonth = documentName !== "Manual entry" && importMonths.length === 1 ? importMonths[0] : month;
      const validated = validateSpendRows(importRows, saveMonth);
      const response = await fetch("/api/metrics/contractor/spend", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, month: saveMonth, rows: validated, documentName }), signal: AbortSignal.timeout(30000) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || `Save failed (${response.status}). Please try again.`);
      setPending([]); setRevision(value => value + 1);
      setEntry({ date: "", vendor: "", spend: "", sourceFile: "" });
      setMessage(`${result.added} rows added; ${result.skipped} identical rows skipped. Run a new report to use the updated spend.`);
    } catch (error) { setMessage(error instanceof Error && error.name === "TimeoutError" ? "The save took too long to respond. Check saved entries before retrying; an identical retry will not add duplicates." : error instanceof Error ? error.message : "Could not save spend."); }
    finally { setBusy(false); }
  }
  async function remove(row: any) {
    if (!window.confirm(`Permanently delete ${row.vendor} spend of $${row.spend} on ${row.spend_date}? Future reports will exclude it. Saved reports are unchanged.`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/metrics/contractor/spend", { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, id: row.id }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setRevision(value => value + 1);
      setMessage("Entry deleted. Run a new report to use the corrected spend total.");
    } catch (error) { setMessage(String(error)); } finally { setBusy(false); }
  }
  async function edit(id: string, row: any) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/metrics/contractor/spend", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, id, row }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setRevision(value => value + 1); setMessage("Entry updated. Run a new report to use the corrected spend total."); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update entry."); return false; }
    finally { setBusy(false); }
  }
  function template() {
    const url = URL.createObjectURL(new Blob([`Date,Vendor,Spend,Channel,Campaign,Document URL\n${month}-01,Google Ads,1000,Paid search,,\n`], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = "marketing-spend-template.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className={styles.previewPanel} aria-label="Monthly marketing spend">
    <h2>Monthly marketing spend</h2>
    <p>Add each month's marketing costs here. Import CSV or Excel (.xlsx or .xls), or enter a cost and link its invoice, PDF, or Google Sheet. Links are supporting documents; only the amounts below count toward reports.</p>
    <div className={styles.actionRow}><label>Import month <input type="month" value={month} disabled={busy || reading} onChange={event => { if (event.target.value) setMonth(event.target.value); }} /></label><strong>{rows.filter(row => row.spend_date?.startsWith(month)).reduce((sum, row) => sum + Number(row.spend), 0).toLocaleString("en-US", { style: "currency", currency: "USD" })} saved for {month}</strong></div>
    <p>Use the actual expense date. Partial-period reports include only costs dated within that period; monthly totals are not automatically prorated.</p>
    {canEdit && <>
      <div className={styles.actionRow}><button type="button" onClick={template}>Download CSV template</button><label>Import CSV or Excel <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" disabled={busy || reading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void readFile(file); }} /></label></div>
      {reading && <p role="status">Reading spreadsheet...</p>}
      {workbook && <label>Worksheet in {name}<select value={sheetName} disabled={busy || reading} onChange={event => void chooseSheet(workbook, event.target.value)}><option value="" disabled>Choose a worksheet</option>{sheets.map(sheet => <option key={sheet} value={sheet}>{sheet}</option>)}</select><small>Required columns: Date, Vendor, Spend. Optional: Channel, Campaign, Document URL. Use real Excel dates or YYYY-MM-DD text. Formulas use their saved results; recalculate and save in Excel first.</small></label>}
      {pending.length > 0 && <div className={styles.previewPanel}><strong>{name}{sheetName ? ` / ${sheetName}` : ""}: {pending.length - excluded.length} of {pending.length} rows selected</strong>
        <p>Uncheck totals, notes and rows you do not want counted. Only selected rows will be saved and validated. Date, vendor and amount are required; choose which optional fields to retain.</p>
        <div className={styles.actionRow}>{[["channel", "Channel"], ["campaign", "Campaign"], ["sourceFile", "Document URL"]].map(([key, label]) => <label key={key}><input type="checkbox" disabled={busy} checked={optionalFields.includes(key)} onChange={() => setOptionalFields(current => current.includes(key) ? current.filter(value => value !== key) : [...current, key])} />{label}</label>)}</div>
        <div style={{ overflowX: "auto", maxHeight: 300 }}><table><thead><tr><th>Include</th><th>Date</th><th>Vendor</th><th>Amount</th><th>Channel</th><th>Campaign</th></tr></thead><tbody>{pending.map((row, index) => <tr key={index}><td><input type="checkbox" aria-label={`Include row ${index + 1}: ${row.vendor}`} disabled={busy} checked={!excluded.includes(index)} onChange={() => setExcluded(current => current.includes(index) ? current.filter(value => value !== index) : [...current, index])} /></td><td>{row.date}</td><td>{row.vendor}</td><td>{row.spend}</td><td>{row.channel}</td><td>{row.campaign}</td></tr>)}</tbody></table></div>
        <p role="status">{detectedMonth ? <>Detected expense month: <strong>{detectedMonth}</strong>. Selected automatically from your transaction dates. Original expense dates are preserved.</> : detectedMonths.length > 1 ? `This file spans ${detectedMonths.join(", ")}. Select rows for one month at a time; nothing has been saved.` : "No readable expense dates found. Check the Date column before confirming."}</p>
        <button type="button" disabled={busy || excluded.length === pending.length} onClick={() => void save(pending.filter((_, index) => !excluded.includes(index)).map(row => ({ ...row, channel: optionalFields.includes("channel") ? row.channel : "", campaign: optionalFields.includes("campaign") ? row.campaign : "", sourceFile: optionalFields.includes("sourceFile") ? row.sourceFile : "" })), sheetName ? `${name} / ${sheetName}` : name)}>{busy ? "Saving selected rows..." : "Confirm selected rows"}</button><button type="button" disabled={busy} onClick={() => setPending([])}>Cancel</button>
        {message && <div role="alert" style={{ border: "2px solid currentColor", borderRadius: 8, padding: 12, marginTop: 12 }}><strong>Import feedback</strong><p>{message}</p></div>}</div>}
      <form className={styles.formGrid} onSubmit={event => { event.preventDefault(); try { void save(validateSpendRows([entry], month), "Manual entry"); } catch (error) { setMessage(String(error)); } }}>
        <label>Date<input type="date" required value={entry.date} onChange={e => setEntry({ ...entry, date: e.target.value })} /></label>
        <label>Vendor / channel<input required placeholder="Google Ads, Meta, agency fee..." value={entry.vendor} onChange={e => setEntry({ ...entry, vendor: e.target.value })} /></label>
        <label>Amount ($)<input type="number" step="0.01" required value={entry.spend} onChange={e => setEntry({ ...entry, spend: e.target.value })} /></label>
        <label>Supporting document link (optional)<input type="url" placeholder="https://drive.google.com/..." value={entry.sourceFile} onChange={e => setEntry({ ...entry, sourceFile: e.target.value })} /></label>
        <button type="submit" disabled={busy}>Add spend</button>
      </form>
      <small>Identical repeat imports are skipped. For a corrected file, remove its old rows before importing the replacement. Imported rows and the filename are saved permanently; the original spreadsheet is not stored.</small>
    </>}
    {message && <p role="status">{message}</p>}
    <ContractorSpendLedger rows={rows} canEdit={canEdit} busy={busy} loading={loadingRows} allMonths={allMonths} onAllMonths={setAllMonths} onRemove={remove} onEdit={edit} />
  </section>;
}
