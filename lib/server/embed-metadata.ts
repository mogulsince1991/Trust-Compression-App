import type { NormalizedJourneyEmbed } from "@/lib/journey-embeds";

export async function enrichEmbed<T extends NormalizedJourneyEmbed>(asset: T, titleProvided: boolean): Promise<T> {
  if (asset.sourcePlatform === "google_drive") {
    const key = process.env.GOOGLE_DRIVE_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
    const id = String(asset.metadata.fileId || "");
    if (!key || !/^[\w-]{10,200}$/.test(id)) return asset;
    try {
      const url = new URL(`https://www.googleapis.com/drive/v3/files/${id}`);
      url.searchParams.set("key", key); url.searchParams.set("fields", "name,mimeType,videoMediaMetadata,thumbnailLink");
      const response = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) return asset;
      const data = await response.json();
      return { ...asset, assetType: String(data.mimeType).startsWith("video/") ? "video" : asset.assetType,
        title: !titleProvided && typeof data.name === "string" ? data.name : asset.title,
        thumbnailUrl: data.thumbnailLink ? `/api/media/drive/${id}/preview?image=1` : null,
        metadata: { ...asset.metadata, ...(data.videoMediaMetadata || {}), measurement: "unavailable" } };
    } catch { return asset; }
  }
  const endpoint = asset.sourcePlatform === "vimeo" ? "https://vimeo.com/api/oembed.json" : asset.sourcePlatform === "loom" ? "https://www.loom.com/v1/oembed" : null;
  if (!endpoint) return asset;
  try {
    const response = await fetch(`${endpoint}?url=${encodeURIComponent(asset.sourceUrl)}`, { redirect: "error", next: { revalidate: 300 }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return asset;
    const value = await response.json();
    return { ...asset, title: !titleProvided && typeof value.title === "string" ? value.title.slice(0, 300) : asset.title,
      thumbnailUrl: value.thumbnail_url ? `/api/media/thumbnail?url=${encodeURIComponent(asset.sourceUrl)}` : null,
      metadata: { ...asset.metadata, ...(Number(value.width) > 0 && Number(value.height) > 0 ? { width: Number(value.width), height: Number(value.height) } : {}) } };
  } catch { return asset; }
}
