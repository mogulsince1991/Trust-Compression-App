type OrderedItem = { id: string; added: string | null; published?: string | null; metadata?: Record<string, unknown> | null };
const timestamp = (value: unknown) => typeof value === "string" ? Date.parse(value) || 0 : 0;

export function orderLibraryItems<T extends OrderedItem>(items: T[]): T[] {
  const groupFor = (item: T) => {
    const source = item.metadata?.canonicalSourceUrl || item.metadata?.sourceUrl;
    if (typeof source !== "string") return `item:${item.id}`;
    return `source:${source}:${item.metadata?.libraryBatchAddedAt || "legacy"}`;
  };
  const groupDates = new Map<string, number>();
  for (const item of items) {
    const group = groupFor(item);
    const added = timestamp(item.metadata?.libraryBatchAddedAt) || timestamp(item.added);
    groupDates.set(group, Math.max(groupDates.get(group) || 0, added));
  }
  return [...items].sort((a, b) => {
    const aGroup = groupFor(a), bGroup = groupFor(b);
    const dateDifference = groupDates.get(bGroup)! - groupDates.get(aGroup)!;
    if (dateDifference) return dateDifference;
    if (aGroup !== bGroup) return aGroup.localeCompare(bGroup);
    return timestamp(b.published) - timestamp(a.published) || timestamp(b.added) - timestamp(a.added) || a.id.localeCompare(b.id);
  });
}
