"use client";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { AssetThumbnail } from "./asset-thumbnail";
import type { JourneyAsset } from "./trust-app-shared";

export function journeyContentKey(asset: JourneyAsset) {
  return asset.videoId ? `video:${asset.videoId}` : asset.libraryAssetId ? `asset:${asset.libraryAssetId}` : asset.id;
}
export function JourneyContentPicker({ items, assets, onAdd, busy }: { items: JourneyAsset[]; assets: JourneyAsset[]; onAdd: (items: JourneyAsset[]) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const included = new Set(assets.map(journeyContentKey));
  const unique = Array.from(new Map(items.map(item => [journeyContentKey(item), item])).values());
  const matches = unique.filter(item => `${item.title} ${item.summary || ""}`.toLowerCase().includes(query.toLowerCase()));
  const chosen = unique.filter(item => selected.includes(journeyContentKey(item)) && !included.has(journeyContentKey(item)));
  return <section className="sage-panel journey-content-picker" aria-label="Add journey content">
    <div className="sage-section-heading"><div><h2>Journey content</h2><p>Add videos, photos, or documents already in your library.</p></div><button className="sage-primary" disabled={busy} aria-expanded={open} aria-controls="journey-content-options" onClick={() => setOpen(!open)}><Plus />{open ? "Close picker" : "Add content"}</button></div>
    {open && <div id="journey-content-options">
      <label className="sage-search"><Search /><input autoFocus aria-label="Search library content" placeholder="Search your library" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="journey-content-options">{matches.map(item => { const key = journeyContentKey(item), added = included.has(key); return <label key={key} className="journey-content-option">
        <input type="checkbox" disabled={busy || added} checked={added || selected.includes(key)} onChange={e => setSelected(current => e.target.checked ? [...current, key] : current.filter(id => id !== key))} />
        <span className="sage-thumbnail"><AssetThumbnail asset={item} /></span><span><strong>{item.title}</strong><small>{added ? "Already in this journey" : item.sourcePlatform === "image" ? "Photo" : item.assetType === "video" ? "Video" : "Document / embed"}</small></span>
      </label>; })}{!matches.length && <p>{items.length ? "No matching content. Try a different search." : "Your library is empty. Add content in Library first."}</p>}</div>
      <div className="sage-actions journey-content-picker-actions"><span role="status">{chosen.length} selected</span><button disabled={busy} onClick={() => { setSelected([]); setOpen(false); }}>Cancel</button><button className="sage-primary" disabled={busy || !chosen.length} onClick={() => { onAdd(chosen); setSelected([]); setOpen(false); }}>Add {chosen.length || "selected"} to journey</button></div>
      <p className="sage-help">New items are added at the end. Save changes to update your journey.</p>
    </div>}
  </section>;
}
