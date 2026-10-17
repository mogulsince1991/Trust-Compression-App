"use client";

import { useState, type FormEvent } from "react";
import { FileText, Video, FolderOpen, Layers, X } from "lucide-react";
import type { JourneyEmbedDraft } from "./trust-app-shared";
import { GooglePhotosImport } from "./google-photos-import";

const choices = [
  { id: "file", title: "File or document", detail: "PDF, image, Google Doc, presentation or shared Drive file", icon: FileText },
  { id: "video", title: "One video", detail: "YouTube, Drive, Vimeo, Loom and supported embeds", icon: Video },
  { id: "folder", title: "Resource folder", detail: "Import supported content from a Google Drive folder", icon: FolderOpen },
  { id: "channel", title: "Channel or playlist", detail: "Import videos from a YouTube channel or playlist", icon: Layers },
  { id: "photos", title: "Google Photos", detail: "Select multiple photos or browse an album to import copies", icon: Layers }
];

export function AddContentPanel({ workspaceId, onPhotosImported, draft, onChange, onSave, onImport, busy, onClose }: {
  workspaceId: string; onPhotosImported: () => void | Promise<void>;
  draft: JourneyEmbedDraft; onChange: (draft: JourneyEmbedDraft) => void; onSave: () => void;
  onImport: (event: FormEvent<HTMLFormElement>) => void; busy: boolean; onClose: () => void;
}) {
  const [kind, setKind] = useState("");
  const collection = kind === "folder" || kind === "channel";
  return <section className="sage-panel sage-add-content" aria-label="Add content">
    <div className="sage-section-heading"><h2>What would you like to add?</h2><button onClick={onClose} aria-label="Close add content"><X /></button></div>
    <p>Add links to videos and documents, import a folder or channel, or copy selected photos from Google Photos.</p>
    <div className="sage-add-choices">{choices.map(choice => <button key={choice.id} aria-pressed={kind === choice.id} onClick={() => setKind(choice.id)}><choice.icon /><strong>{choice.title}</strong><small>{choice.detail}</small></button>)}</div>
    {kind === "photos" && <GooglePhotosImport workspaceId={workspaceId} onImported={onPhotosImported} />}
    {kind && kind !== "photos" && <form key={kind} onSubmit={collection ? onImport : event => { event.preventDefault(); onSave(); }}>
      {!collection && <label>Display title (optional)<input value={draft.title} onChange={event => onChange({ ...draft, title: event.target.value })} placeholder="Leave blank to use the original title" /></label>}
      {collection ? <label>{kind === "folder" ? "Google Drive folder link" : "YouTube channel or playlist link"}<input name="sourceUrl" type="url" required placeholder="https://..." /></label> : <label>{kind === "file" ? "File link or embed code" : "Video link or embed code"}<input required value={draft.url} onChange={event => onChange({ ...draft, url: event.target.value })} placeholder="Paste your link here" /></label>}
      <p className="sage-help">Make sure customers can access the original content. Imported items will appear in Your content below.</p>
      <button className="sage-primary" disabled={busy}>{busy ? "Adding content..." : collection ? "Import to library" : "Add to library"}</button>
    </form>}
    <details><summary>How to add content</summary><p>A short walkthrough from Unmarked will appear here when available.</p></details>
  </section>;
}
