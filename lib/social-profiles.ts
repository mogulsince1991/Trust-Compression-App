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
    status: profile.platform === "youtube" ? "youtube_pending" : "identity_only",
    refreshedAt: now,
    connectorReady: false,
    capabilities: {
      live: false,
      sourceLabel: profile.platform === "youtube" ? "Waiting for analysis" : "Saved identity only",
      sourceNote:
        profile.platform === "youtube"
          ? "Analyze this profile to build a founder-useful YouTube report."
          : "This platform is saved for reuse, but live analytics are not connected yet.",
    },
    report: {
      kind: "identity_profile_report",
      title: profile.displayName || profile.username || "Saved social profile",
      summary:
        profile.platform === "youtube"
          ? "This YouTube profile is saved and ready. Run analysis to turn it into a real content and import report."
          : "This profile is saved and ready to reuse. Live analytics are not connected for this platform yet.",
      sourceLabel: profile.platform === "youtube" ? "Waiting for analysis" : "Saved identity only",
      sourceNote:
        profile.platform === "youtube"
          ? "No live YouTube report has been generated yet."
          : "Only the profile identity is available right now.",
      overview: [
        { id: "platform", label: "Platform", value: profile.platform, format: "text", detail: "Saved profile platform." },
        { id: "username", label: "Username", value: profile.username || "Missing", format: "text", detail: "Normalized handle stored for reuse." },
        { id: "business_profile", label: "Business profile", value: profile.businessProfileLabel || "Unassigned", format: "text", detail: "Saved client or business label." },
        { id: "state", label: "Status", value: profile.platform === "youtube" ? "Ready to analyze" : "Saved", format: "text", detail: "No live report is cached yet." },
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
      topVideos: [],
      recommendations: [],
      contentGaps: [],
    },
  };
}

export function parseMetricSnapshot(metrics: Record<string, any> | null | undefined) {
  const identity = metrics?.identity ?? {};
  const capabilities = isRecord(metrics?.capabilities) ? metrics.capabilities : {};
  const report = isRecord(metrics?.report) ? metrics.report : {};
  return {
    status: String(metrics?.status ?? "saved"),
    refreshedAt: typeof metrics?.refreshedAt === "string" ? metrics.refreshedAt : null,
    displayName: typeof identity.displayName === "string" ? identity.displayName : null,
    businessProfileLabel: typeof identity.businessProfileLabel === "string" ? identity.businessProfileLabel : null,
    sourceLabel: typeof capabilities.sourceLabel === "string" ? capabilities.sourceLabel : null,
    sourceNote: typeof capabilities.sourceNote === "string" ? capabilities.sourceNote : null,
    live: Boolean(capabilities.live),
    summary: typeof report.summary === "string" ? report.summary : null,
  };
}

export function readSocialProfileReport(metrics: Record<string, any> | null | undefined) {
  const report = isRecord(metrics?.report) ? metrics?.report : {};
  const overview = Array.isArray(report.overview) ? report.overview : [];
  const sections = Array.isArray(report.sections) ? report.sections : [];
  const topVideos = Array.isArray(report.topVideos) ? report.topVideos : [];
  const recommendations = Array.isArray(report.recommendations) ? report.recommendations : [];
  const contentGaps = Array.isArray(report.contentGaps) ? report.contentGaps : [];
  const channelSnapshot = isRecord(report.channelSnapshot) ? report.channelSnapshot : null;

  return {
    kind: typeof report.kind === "string" ? report.kind : "identity_profile_report",
    title: typeof report.title === "string" ? report.title : "Profile report",
    summary:
      typeof report.summary === "string"
        ? report.summary
        : "No structured profile report is available yet.",
    sourceLabel: typeof report.sourceLabel === "string" ? report.sourceLabel : "",
    sourceNote: typeof report.sourceNote === "string" ? report.sourceNote : "",
    channelSnapshot,
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
    topVideos: topVideos.filter(isRecord).map((item) => ({
      id: String(item.id ?? cryptoSafeId()),
      title: String(item.title ?? "Untitled video"),
      publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : null,
      viewCount: item.viewCount ?? null,
      likeCount: item.likeCount ?? null,
      commentCount: item.commentCount ?? null,
      category: String(item.category ?? "Unknown"),
      stage: String(item.stage ?? "Unknown"),
      trustTheme: String(item.trustTheme ?? "Unknown"),
      thumbnailUrl: typeof item.thumbnailUrl === "string" ? item.thumbnailUrl : null,
      sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : null,
      imported: Boolean(item.imported),
      recommendationReason: typeof item.recommendationReason === "string" ? item.recommendationReason : "",
    })),
    recommendations: recommendations.filter(isRecord).map((item) => ({
      id: String(item.id ?? cryptoSafeId()),
      title: String(item.title ?? "Untitled video"),
      publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : null,
      viewCount: item.viewCount ?? null,
      category: String(item.category ?? "Unknown"),
      stage: String(item.stage ?? "Unknown"),
      trustTheme: String(item.trustTheme ?? "Unknown"),
      thumbnailUrl: typeof item.thumbnailUrl === "string" ? item.thumbnailUrl : null,
      sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : null,
      imported: Boolean(item.imported),
      reason: typeof item.reason === "string" ? item.reason : "",
      score: item.score ?? null,
    })),
    contentGaps: contentGaps.filter(isRecord).map((item) => ({
      id: String(item.id ?? cryptoSafeId()),
      title: String(item.title ?? "Content gap"),
      status: String(item.status ?? "unknown"),
      count: item.count ?? 0,
      detail: typeof item.detail === "string" ? item.detail : "",
    })),
  };
}

export function socialProfileStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "youtube_live_api":
      return "YouTube report ready";
    case "youtube_limited_rss":
      return "Limited RSS report";
    case "youtube_pending":
      return "Ready to analyze";
    case "identity_only":
      return "Saved identity only";
    default:
      return "Saved profile";
  }
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
