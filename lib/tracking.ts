export const TRACKING_PARAM_LINK = "tc_link";
export const TRACKING_PARAM_VISIT = "tc_visit";
export const TRACKING_PARAM_JOURNEY = "tc_journey";

export const trackingEventTypes = ["redirect", "page_view", "cta_click"] as const;

export type TrackingEventType = (typeof trackingEventTypes)[number];

export function isTrackingEventType(value: string | null | undefined): value is TrackingEventType {
  return trackingEventTypes.includes((value ?? "") as TrackingEventType);
}

export function slugifyTrackingLabel(value: string) {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);

  return base || "link";
}

export function buildTrackingSlug(title: string, seed?: string) {
  const base = slugifyTrackingLabel(title);
  const suffix = (seed ?? crypto.randomUUID()).replace(/-/g, "").slice(0, 8).toLowerCase();
  return `${base}-${suffix}`;
}

export function normalizeDestinationUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Destination URL must start with http:// or https://");
  }

  return url.toString();
}

export function appendTrackingParams(destinationUrl: string, tracking: { slug: string; visitId: string; journeyId?: string | null }) {
  const url = new URL(destinationUrl);
  url.searchParams.set(TRACKING_PARAM_LINK, tracking.slug);
  url.searchParams.set(TRACKING_PARAM_VISIT, tracking.visitId);
  if (tracking.journeyId) url.searchParams.set(TRACKING_PARAM_JOURNEY, tracking.journeyId);
  return url.toString();
}

export function sanitizeText(value: string | null | undefined, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : null;
}

export function sanitizeUrl(value: string | null | undefined, maxLength = 1800) {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().slice(0, maxLength);
}

export function sanitizeMetadata(value: unknown, depth = 0): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 2) return null;

  const entries = Object.entries(value as Record<string, unknown>).slice(0, 30);
  const next = Object.fromEntries(
    entries.flatMap(([key, entryValue]) => {
      const safeKey = key.trim().slice(0, 80);
      if (!safeKey) return [];

      if (typeof entryValue === "string") return [[safeKey, entryValue.slice(0, 500)]];
      if (typeof entryValue === "number" || typeof entryValue === "boolean" || entryValue === null) return [[safeKey, entryValue]];
      if (Array.isArray(entryValue)) return [[safeKey, entryValue.slice(0, 20).map((item) => (typeof item === "string" ? item.slice(0, 200) : item))]];

      const nested = sanitizeMetadata(entryValue, depth + 1);
      return nested ? [[safeKey, nested]] : [];
    })
  );

  return Object.keys(next).length ? next : null;
}

export function sanitizeSearchParams(url: URL) {
  const next: Record<string, string> = {};

  Array.from(url.searchParams.entries())
    .slice(0, 40)
    .forEach(([key, value]) => {
      const safeKey = key.trim().slice(0, 80);
      if (!safeKey) return;
      next[safeKey] = value.slice(0, 300);
    });

  return next;
}
