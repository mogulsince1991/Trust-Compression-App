"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

type Asset = { sourceUrl?: string | null; embedUrl?: string | null; thumbnailUrl?: string | null; metadata?: Record<string, unknown> | null };

export function assetThumbnailUrl(asset: Asset, quality: "standard" | "high" = "standard") {
  try {
    const url = new URL(asset.sourceUrl || asset.embedUrl || "");
    if (url.hostname === "drive.google.com" && !asset.metadata?.localThumbnailOverride) {
      const id = url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] || url.searchParams.get("id");
      if (id && /^[\w-]{10,200}$/.test(id)) return `/api/media/drive/${id}/preview?image=1${quality === "high" ? "&size=1200" : ""}`;
    }
    if (!asset.thumbnailUrl && ["loom.com", "www.loom.com", "vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(url.hostname)) {
      return `/api/media/thumbnail?url=${encodeURIComponent(url.toString())}`;
    }
  } catch { /* Invalid sources use their saved thumbnail or a placeholder. */ }
  return asset.thumbnailUrl || null;
}

export function thumbnailCandidates(asset: Asset, quality: "standard" | "high" = "standard") {
  const candidates: string[] = [];
  if (quality === "high" && !asset.metadata?.localThumbnailOverride) {
    try {
      const url = new URL(asset.sourceUrl || asset.embedUrl || "");
      const host = url.hostname.replace(/^www\./, "");
      const id = host === "youtu.be" ? url.pathname.slice(1) : ["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)
        ? url.searchParams.get("v") || url.pathname.match(/\/(?:embed|shorts)\/([\w-]+)/)?.[1] : null;
      if (id && /^[\w-]{11}$/.test(id)) candidates.push(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${id}/sddefault.jpg`, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
    } catch { /* Fall back to the saved provider preview. */ }
  }
  candidates.push(assetThumbnailUrl(asset, quality) || "", asset.thumbnailUrl || "");
  return Array.from(new Set(candidates.filter(Boolean)));
}

export function AssetThumbnail({ asset, quality = "standard" }: { asset: Asset; quality?: "standard" | "high" }) {
  const candidates = thumbnailCandidates(asset, quality);
  return <ThumbnailImage key={candidates.join("|")} candidates={candidates} />;
}

function ThumbnailImage({ candidates }: { candidates: string[] }) {
  const [index, setIndex] = useState(0);
  const source = candidates[index];
  if (!source) return <FileText aria-label="Preview unavailable" />;
  return <img src={source} alt="" loading="lazy" decoding="async" style={{ objectFit: "contain", background: "#202221" }}
    onLoad={event => {
      // YouTube sometimes returns a tiny placeholder with HTTP 200 for missing HD covers.
      if (/i\.ytimg\.com.*\/(maxresdefault|sddefault)\.jpg$/.test(source) && event.currentTarget.naturalWidth <= 120) setIndex(value => value + 1);
    }}
    onError={() => setIndex(value => value + 1)} />;
}
