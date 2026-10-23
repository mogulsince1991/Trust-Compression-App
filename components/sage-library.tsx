"use client";

import { SageActionDock } from "./sage-action-dock";
import { ArrowLeft, ArrowRight, FileText, Grid2X2, List, Plus, Search, Video, X, ExternalLink, Archive } from "lucide-react";
import { useEffect, useState, useDeferredValue } from "react";
import { buildJourneyAssetFromVideo, formatDuration, type DbVideo, type LibraryAssetRow, type JourneyAsset, type JourneyEmbedDraft, type VideoContext, buildOptions } from "./trust-app-shared";
import { AssetThumbnail } from "./asset-thumbnail";
import { ContextEditor } from "./trust-app-library-ui";
import { AddContentPanel } from "./add-content-panel";
import { orderLibraryItems } from "@/lib/library-order";
import { AssetTitleEditor } from "./asset-title-editor";
import { DeleteGooglePhoto } from "./google-photos-import";

export function libraryItem(asset: LibraryAssetRow): JourneyAsset { return { ...asset, libraryAssetId: asset.id, videoId: null, durationSeconds: null, position: 1, note: null }; }
export function AssetPreview({ asset }: { asset: JourneyAsset }) {
  return <SingleAssetPreview key={`${asset.id}:${asset.embedUrl}`} asset={asset} />;
}

function SingleAssetPreview({ asset }: { asset: JourneyAsset }) {
  const [playing, setPlaying] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  let driveId: string | null = null;
  try {
    const url = new URL(asset.sourceUrl || asset.embedUrl || "");
    if (asset.assetType === "video" && url.hostname === "drive.google.com") driveId = url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] || url.searchParams.get("id");
  } catch { /* Non-Drive assets keep their provider player. */ }
  useEffect(() => {
    if (!driveId) return;
    const controller = new AbortController();
    fetch(`/api/media/drive/${encodeURIComponent(driveId)}/preview`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (data?.width > 0 && data?.height > 0) setDimensions({ width: Number(data.width), height: Number(data.height) }); })
      .catch(() => {});
    return () => controller.abort();
  }, [driveId]);
  const width = dimensions?.width || Number(asset.metadata?.width || asset.metadata?.videoWidth || 0);
  const height = dimensions?.height || Number(asset.metadata?.height || asset.metadata?.videoHeight || 0);
  const portrait = width > 0 && height > 0 ? height > width : /portrait|9[:/]16/.test(String(asset.metadata?.orientation || asset.metadata?.aspectRatio || ""));
  const ratio = width > 0 && height > 0 ? `${width} / ${height}` : portrait ? "9 / 16" : "16 / 9";
  if (!asset.embedUrl) return <div className="sage-preview-placeholder"><FileText /><p>Embedded preview unavailable.</p>{asset.sourceUrl && <a href={asset.sourceUrl} target="_blank" rel="noreferrer">Open original <ExternalLink /></a>}</div>;
  if (asset.sourcePlatform === "image") return <img className="sage-photo-preview" src={asset.embedUrl} alt={asset.title} />;
  if (!playing) return <button className={`sage-media-poster ${asset.assetType !== "video" ? "is-document" : ""}`} onClick={() => setPlaying(true)} aria-label={`Preview ${asset.title}`}><AssetThumbnail asset={asset} quality="high" /><span>{asset.assetType === "video" ? "Play video" : "View document"}</span></button>;
  const directVideo = asset.assetType === "video" && /\.(mp4|webm|mov)(\?|$)/i.test(asset.embedUrl);
  if (driveId) return <div className={`sage-drive-player${portrait ? " is-portrait" : ""}`} style={{ aspectRatio: ratio }}>
    <iframe src={`https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`} title={asset.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
  </div>;
  return directVideo ? <video className="sage-media-video" src={asset.embedUrl} controls playsInline autoPlay /> : <iframe className={`sage-media-frame ${asset.assetType !== "video" ? "is-document" : ""}`} src={asset.embedUrl} title={asset.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />;
}

export function SageLibrary({ workspaceId, onPhotosImported, selectionKey, videos, libraryAssets, assetDraft, onAssetDraftChange, onSaveAsset, saving, onArchive, onDeleteAsset, onSaveContext, onImport, onAddItems, journeys, onAddToExisting, draftCount, onOpenDraft }: { workspaceId: string; onPhotosImported: () => void | Promise<void>; selectionKey: string; videos: DbVideo[]; libraryAssets: LibraryAssetRow[]; assetDraft: JourneyEmbedDraft; onAssetDraftChange: (draft: JourneyEmbedDraft) => void; onSaveAsset: () => void; saving: boolean; onArchive: (v: DbVideo) => void; onDeleteAsset: (a: LibraryAssetRow) => void; onSaveContext: (v: DbVideo, c: VideoContext) => void; onImport: (event: React.FormEvent<HTMLFormElement>) => void; onAddItems: (items: JourneyAsset[]) => void; journeys: { id: string; title: string }[]; onAddToExisting: (id: string, items: JourneyAsset[]) => boolean; draftCount: number; onOpenDraft: () => void }) {
  const [titleOverrides, setTitleOverrides] = useState<Record<string, { title: string; metadata: any }>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [layout, setLayout] = useState("list");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(selectionKey) || "[]");
      if (Array.isArray(saved)) setSelectedIds(saved.filter((id): id is string => typeof id === "string"));
    } catch { /* Selection remains usable if recovery storage is unavailable. */ }
  }, [selectionKey]);
  function updateSelection(ids: string[]) {
    setSelectedIds(ids);
    try { sessionStorage.setItem(selectionKey, JSON.stringify(ids)); } catch { /* Keep in-memory selection. */ }
  }
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [choosingJourney, setChoosingJourney] = useState(false);
  const [targetJourney, setTargetJourney] = useState("");
  const deferredQuery = useDeferredValue(query.toLowerCase());
  useEffect(() => { if (previewId && window.matchMedia("(max-width: 760px)").matches) document.getElementById("sage-content")?.scrollTo(0, 0); }, [previewId]);
  const videoById = new Map(videos.map(v => [v.id, v]));
  const items = orderLibraryItems([...videos.map(v => ({ id: `v:${v.id}`, asset: buildJourneyAssetFromVideo(v), added: v.created_at, published: v.published_at, metadata: v.metadata })), ...libraryAssets.map(a => ({ id: `a:${a.id}`, asset: libraryItem(a), added: a.createdAt }))])
    .map(item => ({ ...item.asset, ...titleOverrides[item.asset.videoId || item.asset.libraryAssetId || item.asset.id] }));
  const key = (a: JourneyAsset) => `${a.videoId ? "v" : "a"}:${a.videoId || a.libraryAssetId}`;
  const visible = items.filter(a => (filter === "all" || (filter === "video" ? a.assetType === "video" : a.assetType !== "video")) && `${a.title} ${a.summary || ""} ${a.sourcePlatform} ${JSON.stringify(a.metadata?.customContext || {})} ${videoById.get(a.videoId)?.tags?.join(" ") || ""}`.toLowerCase().includes(deferredQuery));
  const selected = items.filter(a => selectedIds.includes(key(a)));
  const preview = items.find(a => key(a) === previewId);
  const originalVideo = videos.find(v => v.id === preview?.videoId);
  const originalAsset = libraryAssets.find(a => a.id === preview?.libraryAssetId);
  function toggle(id: string) { updateSelection(selectedIds.includes(id) ? selectedIds.filter(v => v !== id) : [...selectedIds, id]); }
  return <section className={`sage-library ${preview ? "has-preview" : ""}`}>
    <div className="sage-library-main"><header className="sage-page-heading"><div><h1>Your content</h1><p>Everything already added to your library. Select items below to build a journey.</p></div><button className="sage-primary" onClick={() => setAdding(true)}><Plus />Add content</button></header>
      {adding && <AddContentPanel workspaceId={workspaceId} onPhotosImported={onPhotosImported} draft={assetDraft} onChange={onAssetDraftChange} onSave={onSaveAsset} onImport={onImport} busy={saving} onClose={() => setAdding(false)} />}
      <label className="sage-search"><Search /><input aria-label="Search library" placeholder="Search content, topics, or objections" value={query} onChange={e => setQuery(e.target.value)} />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X /></button>}</label>
      <div className="sage-library-toolbar"><div className="sage-segments" aria-label="Content type">{[["all", "All content"], ["video", "Videos"], ["document", "Documents"]].map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div><div className="sage-view-switch"><button aria-label="List view" aria-pressed={layout === "list"} onClick={() => setLayout("list")}><List /></button><button aria-label="Grid view" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}><Grid2X2 /></button></div></div>
      {!items.length ? <div className="sage-empty"><FileText /><h2>Add your first video or document</h2><p>Add a video, proposal, or presentation, then share a focused journey with a customer.</p><button className="sage-primary" onClick={() => setAdding(true)}><Plus />Add your first content</button></div> : !visible.length ? <div className="sage-empty"><Search /><h2>No matching content</h2><p>Try another phrase or clear your filters.</p><button onClick={() => { setQuery(""); setFilter("all"); }}>Clear search and filters</button></div> : <div className={`sage-content-items is-${layout}`}>{visible.map(a => <article key={key(a)} className={`sage-content-item ${selectedIds.includes(key(a)) ? "is-selected" : ""} ${previewId === key(a) ? "is-previewed" : ""}`}><input type="checkbox" aria-label={`Select ${a.title}`} checked={selectedIds.includes(key(a))} onChange={() => toggle(key(a))} /><button className="sage-item-open" onClick={() => setPreviewId(key(a))}><span className="sage-thumbnail"><AssetThumbnail asset={a} /></span><span className="sage-item-copy"><strong>{a.title}</strong><small>{a.assetType === "video" ? <Video /> : <FileText />}{a.assetType === "video" ? "Video" : "Document"}{a.durationSeconds ? ` · ${formatDuration(a.durationSeconds)}` : ""}<span className="sage-item-provider"> · {a.sourcePlatform.replace(/_/g, " ")}</span></small></span><ArrowRight className="sage-row-arrow" /></button></article>)}</div>}
      <SageActionDock><footer className="sage-selection-bar"><span>{selected.length ? `${selected.length} selected` : `${visible.length} ${visible.length === 1 ? "item" : "items"}`}</span>{selected.length ? <div className="sage-actions"><button onClick={() => updateSelection([])}>Clear</button><button onClick={() => setChoosingJourney(true)}>Add to existing journey</button><button className="sage-primary" onClick={() => { onAddItems(selected); updateSelection([]); }}>{draftCount ? "Add to journey" : "Create journey"}<ArrowRight /></button></div> : draftCount > 0 ? <button onClick={onOpenDraft}>Continue journey ({draftCount})<ArrowRight /></button> : null}{choosingJourney && selected.length > 0 && <div className="sage-existing-journey-picker"><label htmlFor="existing-journey">Choose a journey</label><select id="existing-journey" value={targetJourney} onChange={e => setTargetJourney(e.target.value)}><option value="">Select a journey</option>{journeys.map(journey => <option key={journey.id} value={journey.id}>{journey.title || "Untitled journey"}</option>)}</select>{!journeys.length && <p>No saved journeys yet. Create your first journey instead.</p>}<p>Review your additions, then save changes. Items already included will not be duplicated.</p><div className="sage-actions"><button onClick={() => setChoosingJourney(false)}>Cancel</button><button className="sage-primary" disabled={!targetJourney} onClick={() => { if (onAddToExisting(targetJourney, selected)) { updateSelection([]); setChoosingJourney(false); } }}>Add and review</button></div></div>}</footer></SageActionDock>
    </div>
    {preview && <aside key={key(preview)} className="sage-asset-preview">
      <button className="sage-preview-back" onClick={() => setPreviewId(null)}><ArrowLeft />Back to library</button>
      <AssetPreview key={`player:${key(preview)}`} asset={preview} />
      <h2>{preview.title}</h2>
      <AssetTitleEditor key={`title:${key(preview)}`} asset={preview} workspaceId={workspaceId} onSaved={(title, metadata) => setTitleOverrides(current => ({ ...current, [preview.videoId || preview.libraryAssetId || preview.id]: { title, metadata } }))} />
      <span className="sage-badge">{preview.sourcePlatform === "image" ? "Image" : preview.assetType === "video" ? "Video" : "Document"}</span>
      <p>{preview.summary || "Add this asset to a journey to share it with a customer."}</p>
      <button className="sage-primary" onClick={() => onAddItems([preview])}><Plus />Add to journey</button>
      {preview.sourceUrl && <a className="sage-original-link" href={preview.sourceUrl} target="_blank" rel="noreferrer">{preview.metadata?.provider === "google_photos" ? "Open imported photo" : "Open original"} <ExternalLink /></a>}
      {originalVideo && <details><summary>Edit searchable context</summary><ContextEditor key={originalVideo.id} video={originalVideo} saving={saving} options={buildOptions(videos, [])} onSave={onSaveContext} /></details>}
      <button className="sage-danger" onClick={() => { if (originalVideo) onArchive(originalVideo); else if (originalAsset) onDeleteAsset(originalAsset); }}><Archive />Archive asset</button>
      {["google_photos", "workspace_photo"].includes(String(preview.metadata?.provider)) && originalAsset ? <DeleteGooglePhoto workspaceId={workspaceId} assetId={originalAsset.id} onDeleted={async () => { setPreviewId(null); await onPhotosImported(); }} /> : <p className="sage-help">Recipient access is controlled by the original file host.</p>}
    </aside>}
  </section>;
}
