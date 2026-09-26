export const collectionKinds = new Set(["youtube_channel", "youtube_playlist", "drive_folder", "drive_private_folder"]);

// Only auto-check whole collections; individual videos never start a refresh.
export function uniqueCollections<T extends { id: string; metadata: Record<string, unknown> | null }>(sources: T[], parse: (url: string) => any) {
  const seen = new Set<string>();
  return sources.filter(source => {
    try {
      const parsed = parse(String(source.metadata?.canonicalUrl ?? source.metadata?.sourceUrl ?? ""));
      if (!collectionKinds.has(parsed.kind)) return false;
      const identity = parsed.folderId ? `drive:${parsed.folderId}`
        : parsed.playlistId ? `youtube:playlist:${parsed.playlistId}`
        : `youtube:channel:${source.metadata?.channelId ?? parsed.channelId ?? parsed.canonicalUrl.toLowerCase()}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    } catch { return false; }
  });
}

// A source sync updates provider facts, not the owner's organization or archive decisions.
export function preserveCuratedFields<T extends Record<string, unknown>>(payload: T) {
  const update: Record<string, unknown> = { ...payload };
  for (const field of ["summary", "proof_type", "buying_stage", "sales_category", "funnel_stage", "transcript_status", "tags", "deleted_at", "created_by"]) delete update[field];
  return update;
}
