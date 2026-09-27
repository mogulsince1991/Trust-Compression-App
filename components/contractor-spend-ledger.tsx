"use client";

import { useState } from "react";
import styles from "./contractor-metrics-console.module.css";

const columns = [ ["spend_date", "Date"], ["vendor", "Vendor"], ["spend", "Amount"], ["channel", "Channel"], ["campaign", "Campaign"], ["document", "Imported file"], ["source_file", "Document link"] ];
const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ContractorSpendLedger({ rows, canEdit, busy, loading, allMonths, onAllMonths, onRemove, onEdit }: {
  rows: any[]; canEdit: boolean; busy: boolean; loading: boolean; allMonths: boolean; onAllMonths: (value: boolean) => void;
  onRemove: (row: any) => Promise<void>; onEdit: (id: string, row: any) => Promise<boolean>;
}) {
  const [search, setSearch] = useState(""), [sort, setSort] = useState("spend_date"), [descending, setDescending] = useState(true);
  const [visible, setVisible] = useState(["spend_date", "vendor", "spend", "document", "source_file"]);
  const [editing, setEditing] = useState<any | null>(null);
  const value = (row: any, key: string) => key === "document" ? row.raw?.documentName ?? "Manual / previous import" : row[key] ?? "";
  const filtered = rows.filter(row => columns.some(([key]) => String(value(row, key)).toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => (descending ? -1 : 1) * (sort === "spend" ? Number(a.spend) - Number(b.spend) : String(value(a, sort)).localeCompare(String(value(b, sort)))));
  const shown = columns.filter(([key]) => visible.includes(key));
  return <section aria-label="Saved marketing spend" className={styles.previewPanel}>
    <h3>Saved spend entries</h3>
    <p>All imported and manually entered costs are listed here. Search and column choices only change this view, not report totals. Edit a row to correct its fields, or delete it to remove that cost from future reports. Saved reports remain snapshots; run a new report after changes.</p>
    <div className={styles.actionRow}>
      <label><input type="checkbox" checked={allMonths} disabled={busy} onChange={event => onAllMonths(event.target.checked)} /> Show all months</label>
      <label>Search entries<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Vendor, campaign, filename..." /></label>
      <label>Sort by<select value={sort} onChange={event => setSort(event.target.value)}>{columns.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <button type="button" onClick={() => setDescending(!descending)}>{descending ? "Descending" : "Ascending"}</button>
      <details><summary>Visible columns</summary>{columns.map(([key, label]) => <label key={key}><input type="checkbox" checked={visible.includes(key)} disabled={visible.length === 1 && visible.includes(key)} onChange={() => setVisible(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])} />{label}</label>)}</details>
    </div>
    {loading ? <p role="status">Loading saved entries...</p> : <p>{filtered.length} of {rows.length} entries shown · {money(filtered.reduce((sum, row) => sum + Number(row.spend), 0))} shown</p>}
    <div style={{ overflowX: "auto", maxHeight: 520 }}><table><thead><tr>{shown.map(([key, label]) => <th key={key} scope="col">{label}</th>)}{canEdit && <th scope="col">Actions</th>}</tr></thead><tbody>{filtered.map(row => <tr key={row.id}>
      {shown.map(([key]) => <td key={key}>{key === "spend" ? money(Number(row.spend)) : key === "source_file" && /^https:\/\//i.test(row.source_file ?? "") ? <a href={row.source_file} target="_blank" rel="noopener noreferrer">Open document</a> : String(value(row, key)) || "-"}</td>)}
      {canEdit && <td><button type="button" disabled={busy} onClick={() => setEditing({ id: row.id, date: row.spend_date || "", vendor: row.vendor, spend: String(row.spend), channel: row.channel || "", campaign: row.campaign || "", sourceFile: /^https:\/\//i.test(row.source_file ?? "") ? row.source_file : "" })} aria-label={`Edit ${row.vendor} on ${row.spend_date}`}>Edit</button><button type="button" disabled={busy} onClick={() => void onRemove(row)} aria-label={`Delete ${row.vendor} on ${row.spend_date}`}>Delete</button></td>}
    </tr>)}</tbody></table></div>
    {!loading && !filtered.length && <p>{rows.length ? "No entries match your search." : "No saved entries for this selection."}</p>}
    {editing && canEdit && <form className={styles.formGrid} aria-label="Edit saved spend" onSubmit={async event => { event.preventDefault(); if (await onEdit(editing.id, editing)) setEditing(null); }}>
      <h4>Edit saved spend</h4>
      {[["date", "Date", "date"], ["vendor", "Vendor", "text"], ["spend", "Amount ($)", "number"], ["channel", "Channel", "text"], ["campaign", "Campaign", "text"], ["sourceFile", "Supporting document URL", "url"]].map(([key, label, type]) => <label key={key}>{label}<input type={type} step={type === "number" ? "0.01" : undefined} required={["date", "vendor", "spend"].includes(key)} value={editing[key]} disabled={busy} onChange={event => setEditing({ ...editing, [key]: event.target.value })} /></label>)}
      <button type="submit" disabled={busy}>Save changes</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
    </form>}
  </section>;
}
