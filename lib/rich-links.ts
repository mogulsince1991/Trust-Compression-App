type PreviewAsset = { sourceUrl?: string | null; embedUrl?: string | null; thumbnailUrl?: string | null; metadata?: Record<string, unknown> | null };

export function richLinkImage(asset: PreviewAsset, origin: string): string | null {
  try {
    const source = new URL(asset.sourceUrl || asset.embedUrl || "");
    if (source.hostname === "drive.google.com" && !asset.metadata?.localThumbnailOverride) {
      const id = source.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] || source.searchParams.get("id");
      if (id && /^[\w-]{10,200}$/.test(id)) return `${origin}/api/media/drive/${id}/preview?image=1&size=1200`;
    }
    if (!asset.thumbnailUrl && ["loom.com", "www.loom.com", "vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(source.hostname)) {
      return `${origin}/api/media/thumbnail?url=${encodeURIComponent(source.href)}`;
    }
  } catch { /* A saved thumbnail can still be valid when the source is missing. */ }
  if (!asset.thumbnailUrl) return null;
  try {
    const image = new URL(asset.thumbnailUrl, origin);
    return image.protocol === "https:" && !image.username && !image.password ? image.href : null;
  } catch { return null; }
}

export function isLinkPreviewAgent(agent: string) {
  return /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|TelegramBot|WhatsApp|Applebot|iMessageLinkPreview|Googlebot|bingbot/i.test(agent);
}
