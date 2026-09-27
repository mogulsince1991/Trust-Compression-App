"use client";

import { useState, type FormEvent } from "react";
import { FileText, Video, FolderOpen, Layers, X } from "lucide-react";
import type { JourneyEmbedDraft } from "./trust-app-shared";

const choices = [
  { id: "file", title: "File or document", detail: "PDF, image, Google Doc, presentation or shared Drive file", icon: FileText },
  { id: "video", title: "One video", detail: "YouTube, Drive, Vimeo, Loom and supported embeds", icon: Video },
  { id: "folder", title: "Resource folder", detail: "Import supported content from a Google Drive folder", icon: FolderOpen },
  { id: "channel", title: "Channel or playlist", detail: "Import videos from a YouTube channel or playlist", icon: Layers }
];

export function AddContentPanel({ draft, onChange, onSave, onImport, busy, onClose }: {
  draft: JourneyEmbedDraft; onChange: (draft: JourneyEmbedDraft) => void; onSave: () => void;
  onImport: (event: FormEvent<HTMLFormElement>) => void; busy: boolean; onClose: () => void;
}) {
  const [kind, setKind] = useState("");
  const collection = kind === "folder" || kind === "channel";
  return <section className="sage-panel sage-add-content" aria-label="Add content">
    <div className="sage-section-heading"><h2>What would you like to add?</h2><button onClick={onClose} aria-label="Close add content"><X /></button></div>
    <p>Add an existing link. Your files stay with their original host; this does not upload a copy.</p>
    <div className="sage-add-choices">{choices.map(choice => <button key={choice.id} aria-pressed={kind === choice.id} onClick={() => setKind(choice.id)}><choice.icon /><strong>{choice.title}</strong><small>{choice.detail}</small></button>)}</div>
    {kind && <form key={kind} onSubmit={collection ? onImport : event => { event.preventDefault(); onSave(); }}>
      {!collection && <label>Display title<input required value={draft.title} onChange={event => onChange({ ...draft, title: event.target.value })} placeholder="What should customers see?" /></label>}
      {collection ? <label>{kind === "folder" ? "Google Drive folder link" : "YouTube channel or playlist link"}<input name="sourceUrl" type="url" required placeholder="https://..." /></label> : <label>{kind === "file" ? "File link or embed code" : "Video link or embed code"}<input required value={draft.url} onChange={event => onChange({ ...draft, url: event.target.value })} placeholder="Paste your link here" /></label>}
      <p className="sage-help">Make sure customers can access the original content. Imported items will appear in Your content below.</p>
      <button className="sage-primary" disabled={busy}>{busy ? "Adding content..." : collection ? "Import to library" : "Add to library"}</button>
    </form>}
    <details><summary>How to add content</summary><p>A short walkthrough from Unmarked will appear here when available.</p></details>
  </section>;
}
