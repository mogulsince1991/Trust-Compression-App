export type SupportedSocialPlatform =
  | "instagram"
  | "facebook"
  | "youtube"
  | "tiktok"
  | "linkedin"
  | "x"
  | "other";

export type SocialProfileInput = {
  platform: string;
  profileUrl?: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  businessProfileLabel?: string | null;
};

export type NormalizedSocialProfile = {
  platform: SupportedSocialPlatform;
  profileUrl: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  businessProfileLabel: string | null;
  profileKey: string;
};

const PLATFORM_HOSTS: Record<SupportedSocialPlatform, string[]> = {
  instagram: ["instagram.com", "www.instagram.com"],
  facebook: ["facebook.com", "www.facebook.com", "m.facebook.com"],
  youtube: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"],
  tiktok: ["tiktok.com", "www.tiktok.com"],
  linkedin: ["linkedin.com", "www.linkedin.com"],
  x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
  other: [],
};

export function normalizeSocialProfile(input: SocialProfileInput): NormalizedSocialProfile {
  const platform = normalizePlatform(input.platform);
  const normalizedUrl = normalizeProfileUrl(input.profileUrl);
  const derivedUsername = deriveUsername(platform, normalizedUrl);
  const explicitUsername = normalizeUsername(input.username);
  const username = explicitUsername ?? derivedUsername ?? null;
  const profileUrl = normalizedUrl ? canonicalizeProfileUrl(platform, normalizedUrl, username) : buildProfileUrl(platform, username);
  const displayName = cleanText(input.displayName);
  const avatarUrl = normalizeProfileUrl(input.avatarUrl);
  const businessProfileLabel = cleanText(input.businessProfileLabel);

  if (!profileUrl && !username) {
    throw new Error("Enter a profile URL or username.");
  }

  return {
    platform,
    profileUrl,
    username,
    displayName,
    avatarUrl,
    businessProfileLabel,
    profileKey: buildProfileKey(platform, profileUrl, username),
  };
}

export function buildProfileMetricsCache(profile: {
  platform: string;
  profileUrl: string | null;
  username: string | null;
  displayName: string | null;
  businessProfileLabel: string | null;
  latestCachedMetrics?: Record<string, any> | null;
}) {
  const previous = profile.latestCachedMetrics ?? {};
  const previousReport = isRecord(previous.report) ? previous.report : null;
  const now = new Date().toISOString();
  return {
    ...previous,
    identity: {
      platform: profile.platform,
      username: profile.username,
      profileUrl: profile.profileUrl,
      displayName: profile.displayName,
      businessProfileLabel: profile.businessProfileLabel,
    },
    status: "saved",
    refreshedAt: now,
    connectorReady: false,
    report:
      previousReport ??
      {
        title: profile.displayName || profile.username || "Saved social profile",
        summary: "This profile is saved and ready to reuse. Live social metrics are not connected yet, so the report is showing the saved identity and cache status only.",
        overview: [
          { id: "followers", label: "Followers", value: null, format: "number", detail: "Not captured yet." },
          { id: "avg_views", label: "Avg views", value: null, format: "number", detail: "Not captured yet." },
          { id: "engagement_rate", label: "Engagement rate", value: null, format: "percent", detail: "Not captured yet." },
          { id: "posts_analyzed", label: "Posts analyzed", value: 0, format: "number", detail: "No connector data ingested yet." },
        ],
        sections: [
          {
            id: "status",
            title: "Saved profile status",
            rows: [
              { label: "Platform", value: profile.platform },
              { label: "Username", value: profile.username || "Missing" },
              { label: "Business profile", value: profile.businessProfileLabel || "Unassigned" },
              { label: "Cache refreshed", value: now },
            ],
          },
        ],
      },
  };
}

export function parseMetricSnapshot(metrics: Record<string, any> | null | undefined) {
  const identity = metrics?.identity ?? {};
  return {
    status: String(metrics?.status ?? "saved"),
    refreshedAt: typeof metrics?.refreshedAt === "string" ? metrics.refreshedAt : null,
    displayName: typeof identity.displayName === "string" ? identity.displayName : null,
    businessProfileLabel: typeof identity.businessProfileLabel === "string" ? identity.businessProfileLabel : null,
  };
}

export function readSocialProfileReport(metrics: Record<string, any> | null | undefined) {
  const report = isRecord(metrics?.report) ? metrics?.report : {};
  const overview = Array.isArray(report.overview) ? report.overview : [];
  const sections = Array.isArray(report.sections) ? report.sections : [];

  return {
    title: typeof report.title === "string" ? report.title : "Profile report",
    summary:
      typeof report.summary === "string"
        ? report.summary
        : "No structured profile report is available yet.",
    overview: overview
      .filter(isRecord)
      .map((item) => ({
        id: String(item.id ?? item.label ?? cryptoSafeId()),
        label: String(item.label ?? "Metric"),
        value: item.value ?? null,
        format: typeof item.format === "string" ? item.format : "text",
        detail: typeof item.detail === "string" ? item.detail : "",
      })),
    sections: sections
      .filter(isRecord)
      .map((section) => ({
        id: String(section.id ?? section.title ?? cryptoSafeId()),
        title: String(section.title ?? "Section"),
        rows: Array.isArray(section.rows)
          ? section.rows.filter(isRecord).map((row) => ({
              label: String(row.label ?? "Label"),
              value: row.value ?? null,
            }))
          : [],
      })),
  };
}

function normalizePlatform(value: string): SupportedSocialPlatform {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "twitter") return "x";
  if (normalized in PLATFORM_HOSTS) return normalized as SupportedSocialPlatform;
  return "other";
}

function normalizeProfileUrl(value: string | null | undefined) {
  const text = cleanText(value);
  if (!text) return null;
  const prefixed = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(prefixed);
    url.hash = "";
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeUsername(value: string | null | undefined) {
  const text = cleanText(value)?.replace(/^@+/, "") ?? null;
  return text ? text.toLowerCase() : null;
}

function deriveUsername(platform: SupportedSocialPlatform, profileUrl: string | null) {
  if (!profileUrl) return null;
  try {
    const url = new URL(profileUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    if (!parts.length) return null;

    if (platform === "youtube") {
      if (parts[0]?.startsWith("@")) return parts[0].slice(1).toLowerCase();
      if (parts[0] === "channel" || parts[0] === "user" || parts[0] === "c") return parts[1]?.replace(/^@+/, "").toLowerCase() ?? null;
    }

    if (platform === "linkedin" && (parts[0] === "company" || parts[0] === "in")) {
      return parts[1]?.replace(/^@+/, "").toLowerCase() ?? null;
    }

    return parts[0]?.replace(/^@+/, "").toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function canonicalizeProfileUrl(
  platform: SupportedSocialPlatform,
  profileUrl: string,
  username: string | null
) {
  try {
    const url = new URL(profileUrl);
    const host = preferredHost(platform) ?? url.hostname;
    url.hostname = host;
    url.search = "";
    if (username && hasKnownHost(platform, host)) {
      if (platform === "youtube") {
        url.pathname = username.startsWith("@") ? `/${username}` : `/@${username}`;
      } else if (platform === "linkedin") {
        url.pathname = `/in/${username}`;
      } else {
        url.pathname = `/${username}`;
      }
    }
    return url.toString();
  } catch {
    return profileUrl;
  }
}

function buildProfileUrl(platform: SupportedSocialPlatform, username: string | null) {
  if (!username) return null;
  const host = preferredHost(platform);
  if (!host) return null;
  if (platform === "youtube") return `https://${host}/@${username}`;
  if (platform === "linkedin") return `https://${host}/in/${username}`;
  return `https://${host}/${username}`;
}

function buildProfileKey(platform: SupportedSocialPlatform, profileUrl: string | null, username: string | null) {
  if (profileUrl) return `${platform}:${profileUrl.toLowerCase()}`;
  return `${platform}:${username ?? "unknown"}`;
}

function preferredHost(platform: SupportedSocialPlatform) {
  return PLATFORM_HOSTS[platform]?.[0] ?? null;
}

function hasKnownHost(platform: SupportedSocialPlatform, host: string) {
  return PLATFORM_HOSTS[platform]?.includes(host) ?? false;
}

function cleanText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cryptoSafeId() {
  return Math.random().toString(36).slice(2, 10);
}
