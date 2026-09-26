export const collectionKinds = new Set(["youtube_channel", "youtube_playlist", "drive_folder", "drive_private_folder"]);

// A source sync updates provider facts, not the owner's organization or archive decisions.
export function preserveCuratedFields<T extends Record<string, unknown>>(payload: T) {
  const update: Record<string, unknown> = { ...payload };
  for (const field of ["summary", "proof_type", "buying_stage", "sales_category", "funnel_stage", "transcript_status", "tags", "deleted_at", "created_by"]) delete update[field];
  return update;
}
