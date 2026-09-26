"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

type Asset = { sourceUrl?: string | null; embedUrl?: string | null; thumbnailUrl?: string | null; metadata?: Record<string, unknown> | null };

export function assetThumbnailUrl(asset: Asset) {
  try {
    const url = new URL(asset.sourceUrl || asset.embedUrl || "");
    if (url.hostname === "drive.google.com" && !asset.metadata?.localThumbnailOverride) {
      const id = url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] || url.searchParams.get("id");
      if (id && /^[\w-]{10,200}$/.test(id)) return `/api/media/drive/${id}/preview?image=1`;
    }
    if (!asset.thumbnailUrl && ["loom.com", "www.loom.com", "vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(url.hostname)) {
      return `/api/media/thumbnail?url=${encodeURIComponent(url.toString())}`;
    }
  } catch { /* Invalid sources use their saved thumbnail or a placeholder. */ }
  return asset.thumbnailUrl || null;
}

export function AssetThumbnail({ asset }: { asset: Asset }) {
  const source = assetThumbnailUrl(asset);
  const [failed, setFailed] = useState<string | null>(null);
  const fallback = asset.thumbnailUrl && asset.thumbnailUrl !== source ? asset.thumbnailUrl : null;
  const effective = source === failed ? fallback : source;
  const [fallbackFailed, setFallbackFailed] = useState(false);
  if (!effective || (source === failed && fallbackFailed)) return <FileText aria-label="Preview unavailable" />;
  return <img src={effective} alt="" loading="lazy" style={{ objectFit: "contain", background: "#202221" }} onError={() => effective === source ? setFailed(source) : setFallbackFailed(true)} />;
}
