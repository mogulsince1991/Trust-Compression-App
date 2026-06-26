import { classifyVideo } from "@/lib/smart-organize";
import { parseSourceUrl } from "@/lib/source-import";

type SocialProfileAnalysisInput = {
  platform: string;
  profileUrl: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl?: string | null;
  businessProfileLabel: string | null;
  latestCachedMetrics?: Record<string, any> | null;
  importedExternalIds?: string[];
};

type YouTubeVideoInsight = {
  videoId: string;
  title: string;
  description: string | null;
  publishedAt: string | null;
  sourceUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  category: string;
  stage: string;
  trustTheme: string;
  recommendationReason: string;
  imported: boolean;
  score: number;
};

type YouTubeChannelSnapshot = {
  importMode: "youtube_live_api" | "youtube_limited_rss";
  channelId: string | null;
  title: string;
  handle: string | null;
  description: string | null;
  canonicalUrl: string;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  totalViews: number | null;
  totalVideos: number | null;
  videos: Array<{
    videoId: string;
    title: string;
    description: string | null;
    publishedAt: string | null;
    sourceUrl: string;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
    viewCount: number | null;
    likeCount: number | null;
    commentCount: number | null;
  }>;
};

const REPORT_LIMIT = 24;
const THEME_LABELS: Record<string, string> = {
  testimonial: "Customer proof",
  project_proof: "Project proof",
  objection_handling: "Objection handling",
  educational: "Education",
  offer_cta: "Offer / CTA",
  behind_the_scenes: "Behind the scenes",
};

export async function buildLiveSocialProfileCache(input: SocialProfileAnalysisInput) {
  const now = new Date().toISOString();
  const previous = input.latestCachedMetrics ?? {};

  if (input.platform !== "youtube") {
    return buildIdentityOnlyProfileCache(input, now, previous, {
      status: "identity_only",
      summary: `${platformLabel(input.platform)} profiles are saved for reuse. Live analytics are only connected for YouTube right now.`,
      sourceLabel: "Saved identity only",
      sourceNote: "No live connector is available for this platform yet.",
      connectorReady: false,
    });
  }

  try {
    const importedIds = new Set((input.importedExternalIds ?? []).filter(Boolean));
    const analysis = await analyzeYouTubeProfile(input);
    return buildYouTubeProfileCache(input, analysis, importedIds, now, previous);
  } catch (error) {
    return buildIdentityOnlyProfileCache(input, now, previous, {
      status: "identity_only",
      summary: error instanceof Error ? error.message : "Could not analyze this YouTube profile yet.",
      sourceLabel: "Saved identity only",
      sourceNote: "The profile was saved, but live analysis could not be completed.",
      connectorReady: false,
    });
  }
}

export function buildIdentityOnlyProfileCache(
  input: SocialProfileAnalysisInput,
  now = new Date().toISOString(),
  previous: Record<string, any> = {},
  options?: {
    status?: string;
    summary?: string;
    sourceLabel?: string;
    sourceNote?: string;
    connectorReady?: boolean;
  }
) {
  const reportTitle = input.displayName || input.username || "Saved social profile";
  return {
    ...previous,
    status: options?.status ?? "identity_only",
    refreshedAt: now,
    connectorReady: options?.connectorReady ?? false,
    capabilities: {
      live: false,
      sourceLabel: options?.sourceLabel ?? "Saved identity only",
      sourceNote: options?.sourceNote ?? "Live social metrics are not connected for this profile yet.",
    },
    identity: {
      platform: input.platform,
      username: input.username,
      profileUrl: input.profileUrl,
      displayName: input.displayName,
      businessProfileLabel: input.businessProfileLabel,
      avatarUrl: input.avatarUrl ?? null,
    },
    report: {
      kind: "identity_profile_report",
      title: reportTitle,
      summary:
        options?.summary ??
        "This profile is saved and ready to reuse. Live social metrics are not connected yet, so only the saved identity is available right now.",
      sourceLabel: options?.sourceLabel ?? "Saved identity only",
      sourceNote: options?.sourceNote ?? "Add live analytics in a future pass to turn this into a report.",
      overview: [
        { id: "platform", label: "Platform", value: platformLabel(input.platform), format: "text", detail: "Saved profile platform." },
        { id: "username", label: "Username", value: input.username ? `@${input.username.replace(/^@+/, "")}` : "Missing", format: "text", detail: "Normalized handle stored for reuse." },
        { id: "profile_state", label: "Status", value: "Saved", format: "text", detail: "Identity is available for reuse." },
        { id: "business_profile", label: "Business profile", value: input.businessProfileLabel || "Unassigned", format: "text", detail: "Saved client or business label." },
      ],
      sections: [
        {
          id: "identity_state",
          title: "Saved profile status",
          rows: [
            { label: "Profile URL", value: input.profileUrl || "Not provided" },
            { label: "Display name", value: input.displayName || "Not provided" },
            { label: "Last refreshed", value: now },
          ],
        },
      ],
      topVideos: [],
      recommendations: [],
      contentGaps: [],
    },
  };
}

async function analyzeYouTubeProfile(input: SocialProfileAnalysisInput): Promise<YouTubeChannelSnapshot> {
  const sourceUrl = getYouTubeProfileUrl(input);
  if (!sourceUrl) throw new Error("Add a YouTube channel URL or handle before analyzing this profile.");

  const parsed = parseSourceUrl(sourceUrl);
  if (parsed.platform !== "youtube" || parsed.kind !== "youtube_channel") {
    throw new Error("Save a YouTube channel or @handle URL for founder reporting. Single videos and playlists do not support this report.");
  }

  const apiKey = getFirstEnv("YOUTUBE_API_KEY", "GOOGLE_YOUTUBE_API_KEY");
  if (apiKey) {
    try {
      return await analyzeYouTubeWithApi(parsed, apiKey);
    } catch {
      return analyzeYouTubeWithRss(parsed);
    }
  }

  return analyzeYouTubeWithRss(parsed);
}

async function analyzeYouTubeWithApi(
  source: Extract<ReturnType<typeof parseSourceUrl>, { platform: "youtube"; kind: "youtube_channel" }>,
  apiKey: string
): Promise<YouTubeChannelSnapshot> {
  const channel = await fetchChannelSnapshot(source, apiKey);
  if (!channel.uploadsPlaylistId) throw new Error("Could not find the public uploads playlist for that channel.");
  const videoIds = await fetchPlaylistVideoIds(channel.uploadsPlaylistId, apiKey, REPORT_LIMIT);
  const videos = await fetchVideoRows(videoIds, apiKey);

  return {
    importMode: "youtube_live_api",
    channelId: channel.channelId,
    title: channel.title || source.handle || "YouTube channel",
    handle: channel.handle ?? source.handle ?? null,
    description: channel.description,
    canonicalUrl: channel.canonicalUrl,
    thumbnailUrl: channel.thumbnailUrl,
    subscriberCount: channel.subscriberCount,
    totalViews: channel.totalViews,
    totalVideos: channel.totalVideos,
    videos,
  };
}

async function analyzeYouTubeWithRss(
  source: Extract<ReturnType<typeof parseSourceUrl>, { platform: "youtube"; kind: "youtube_channel" }>
): Promise<YouTubeChannelSnapshot> {
  const channelId =
    source.channelId ??
    (source.handle && looksLikeChannelId(source.handle) ? source.handle : null) ??
    (source.handle ? await resolveChannelIdFromPage(source.canonicalUrl) : null);

  const rssUrl = channelId
    ? `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
    : source.legacyUsername
      ? `https://www.youtube.com/feeds/videos.xml?user=${encodeURIComponent(source.legacyUsername)}`
      : source.handle
        ? `https://www.youtube.com/feeds/videos.xml?user=${encodeURIComponent(source.handle)}`
        : null;

  if (!rssUrl) throw new Error("Could not resolve recent public uploads for that YouTube profile.");
  const rss = await fetchYouTubeRss(rssUrl, source.canonicalUrl);

  return {
    importMode: "youtube_limited_rss",
    channelId: rss.channelId,
    title: rss.channelTitle || source.handle || "YouTube channel",
    handle: source.handle ?? null,
    description: null,
    canonicalUrl: source.canonicalUrl,
    thumbnailUrl: rss.videos[0]?.thumbnailUrl ?? null,
    subscriberCount: null,
    totalViews: null,
    totalVideos: null,
    videos: rss.videos,
  };
}

function buildYouTubeProfileCache(
  input: SocialProfileAnalysisInput,
  analysis: YouTubeChannelSnapshot,
  importedIds: Set<string>,
  now: string,
  previous: Record<string, any>
) {
  const videos = analysis.videos
    .map((video) => toInsight(video, importedIds))
    .sort((left, right) => compareDates(right.publishedAt, left.publishedAt));

  const recent90 = filterSince(videos, 90);
  const baselinePool = recent90.filter((video) => video.viewCount != null);
  const medianViews = computeMedian(baselinePool.map((video) => Number(video.viewCount)));
  const averageViews = computeAverage(baselinePool.map((video) => Number(video.viewCount)));
  const recent30Count = filterSince(videos, 30).length;
  const recent90Count = recent90.length;
  const bestRecent = pickMax(baselinePool, (video) => Number(video.viewCount ?? 0));
  const weakestRecent = pickMin(baselinePool, (video) => Number(video.viewCount ?? Number.MAX_SAFE_INTEGER));
  const oldestOutperformer = [...recent90]
    .sort((left, right) => compareDates(left.publishedAt, right.publishedAt))
    .find((video) => (video.viewCount ?? 0) > (medianViews ?? 0));
  const underperformingCount = baselinePool.filter((video) => (video.viewCount ?? 0) < (medianViews ?? 0)).length;
  const underperformingPercent = baselinePool.length ? Math.round((underperformingCount / baselinePool.length) * 100) : null;
  const topVideos = rankTopVideos(videos);
  const recommendations = rankRecommendations(videos, medianViews);
  const contentGaps = buildContentGaps(videos);
  const dominantThemes = summarizeThemes(videos);
  const summary = buildFounderSummary({
    channelTitle: analysis.title,
    recent30Count,
    recent90Count,
    averageViews,
    medianViews,
    bestRecent,
    dominantThemes,
    contentGaps,
    importMode: analysis.importMode,
  });

  return {
    ...previous,
    status: analysis.importMode,
    refreshedAt: now,
    connectorReady: true,
    capabilities: {
      live: analysis.importMode === "youtube_live_api",
      sourceLabel: analysis.importMode === "youtube_live_api" ? "YouTube public API" : "Limited RSS fallback",
      sourceNote:
        analysis.importMode === "youtube_live_api"
          ? "Live public channel and video metrics were pulled from the YouTube API."
          : "Only recent public uploads are available because the YouTube API key is missing or the API lookup failed.",
    },
    identity: {
      platform: "youtube",
      username: analysis.handle ?? input.username,
      profileUrl: analysis.canonicalUrl,
      displayName: analysis.title,
      businessProfileLabel: input.businessProfileLabel,
      avatarUrl: analysis.thumbnailUrl ?? input.avatarUrl ?? null,
      channelId: analysis.channelId,
    },
    report: {
      kind: "youtube_profile_report",
      title: analysis.title,
      summary,
      sourceLabel: analysis.importMode === "youtube_live_api" ? "YouTube public API" : "Limited RSS fallback",
      sourceNote:
        analysis.importMode === "youtube_live_api"
          ? "This report is using live public YouTube metrics and recent uploads."
          : "This report is using recent public uploads only. Channel-level stats and per-video engagement metrics are limited.",
      channelSnapshot: {
        title: analysis.title,
        handle: analysis.handle,
        description: analysis.description,
        canonicalUrl: analysis.canonicalUrl,
        thumbnailUrl: analysis.thumbnailUrl,
        channelId: analysis.channelId,
        subscriberCount: analysis.subscriberCount,
        totalViews: analysis.totalViews,
        totalVideos: analysis.totalVideos,
      },
      overview: [
        { id: "recent_uploads", label: "Recent uploads", value: recent90Count, format: "number", detail: `${recent30Count} uploads in the last 30 days.` },
        { id: "avg_views", label: "Avg recent views", value: averageViews, format: "number", detail: "Average views across the recent scored uploads." },
        { id: "median_views", label: "Median recent views", value: medianViews, format: "number", detail: "Median views to compare winners vs. laggards." },
        { id: "underperforming", label: "Underperforming uploads", value: underperformingPercent, format: "percent", detail: "Recent uploads below the recent-view median." },
        { id: "subscribers", label: "Subscribers", value: analysis.subscriberCount, format: "number", detail: "Shown when live API channel stats are available." },
        { id: "total_views", label: "Channel views", value: analysis.totalViews, format: "number", detail: "Shown when live API channel stats are available." },
      ],
      sections: [
        {
          id: "overview_brief",
          title: "Overview",
          rows: [
            { label: "Posting cadence", value: `${recent30Count} uploads in 30 days / ${recent90Count} in 90 days` },
            { label: "Best recent video", value: bestRecent ? `${bestRecent.title} (${formatInteger(bestRecent.viewCount)} views)` : "Not enough live view data yet" },
            { label: "Weakest recent video", value: weakestRecent ? `${weakestRecent.title} (${formatInteger(weakestRecent.viewCount)} views)` : "Not enough live view data yet" },
            { label: "Oldest upload still beating baseline", value: oldestOutperformer ? `${oldestOutperformer.title} (${formatInteger(oldestOutperformer.viewCount)} views)` : "None clearly above the recent median" },
          ],
        },
      ],
      topVideos,
      recommendations,
      contentGaps,
    },
  };
}

function toInsight(
  video: YouTubeChannelSnapshot["videos"][number],
  importedIds: Set<string>
): YouTubeVideoInsight {
  const classification = classifyVideo({
    title: video.title,
    summary: video.description,
    duration_seconds: video.durationSeconds,
    tags: [],
  });
  const trustTheme = inferTrustTheme(video.title, video.description, classification.category);
  const recommendationReason = buildRecommendationReason(video, classification.category, trustTheme);

  return {
    videoId: video.videoId,
    title: video.title,
    description: video.description,
    publishedAt: video.publishedAt,
    sourceUrl: video.sourceUrl,
    thumbnailUrl: video.thumbnailUrl,
    durationSeconds: video.durationSeconds,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    commentCount: video.commentCount,
    category: classification.category,
    stage: classification.stage,
    trustTheme,
    recommendationReason,
    imported: importedIds.has(video.videoId),
    score: 0,
  };
}

function rankTopVideos(videos: YouTubeVideoInsight[]) {
  const ranked = [...videos].sort((left, right) => {
    const leftViews = left.viewCount ?? -1;
    const rightViews = right.viewCount ?? -1;
    if (leftViews !== rightViews) return rightViews - leftViews;
    return compareDates(right.publishedAt, left.publishedAt);
  });

  return ranked.slice(0, 8).map((video) => ({
    id: video.videoId,
    title: video.title,
    publishedAt: video.publishedAt,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    commentCount: video.commentCount,
    category: video.category,
    stage: video.stage,
    trustTheme: video.trustTheme,
    thumbnailUrl: video.thumbnailUrl,
    sourceUrl: video.sourceUrl,
    imported: video.imported,
    recommendationReason: video.recommendationReason,
  }));
}

function rankRecommendations(videos: YouTubeVideoInsight[], medianViews: number | null) {
  const now = Date.now();
  const scored = videos.map((video) => {
    const ageDays = video.publishedAt ? Math.max(1, Math.round((now - Date.parse(video.publishedAt)) / 86400000)) : 365;
    const recencyScore = Math.max(0, 25 - Math.min(ageDays, 25));
    const viewScore = medianViews && video.viewCount != null ? Math.max(0, Math.round((video.viewCount / Math.max(medianViews, 1)) * 25)) : 8;
    const themeScore = ["testimonial", "project_proof", "objection_handling"].includes(video.trustTheme)
      ? 18
      : video.trustTheme === "educational"
        ? 12
        : 8;
    const importPenalty = video.imported ? -30 : 0;
    return { ...video, score: viewScore + themeScore + recencyScore + importPenalty };
  });

  return scored
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map((video) => ({
      id: video.videoId,
      title: video.title,
      publishedAt: video.publishedAt,
      viewCount: video.viewCount,
      category: video.category,
      stage: video.stage,
      trustTheme: video.trustTheme,
      thumbnailUrl: video.thumbnailUrl,
      sourceUrl: video.sourceUrl,
      imported: video.imported,
      reason: video.recommendationReason,
      score: video.score,
    }));
}

function buildContentGaps(videos: YouTubeVideoInsight[]) {
  const counts = videos.reduce<Record<string, number>>((acc, video) => {
    acc[video.trustTheme] = (acc[video.trustTheme] ?? 0) + 1;
    return acc;
  }, {});

  return [
    buildGapRow("project_proof", counts.project_proof ?? 0, "Project proof is what validates the work clearly.", "Add more transformations, walkthroughs, or finished-job breakdowns."),
    buildGapRow("testimonial", counts.testimonial ?? 0, "Customer proof is what removes buyer doubt quickly.", "Add more direct homeowner outcomes or recommendation clips."),
    buildGapRow("objection_handling", counts.objection_handling ?? 0, "Objection handling is what turns attention into trust.", "Add more content on pricing, mess, timing, insurance, and common fears."),
    buildGapRow("educational", counts.educational ?? 0, "Education broadens reach and creates authority.", "Add more explainers around what buyers should know before they decide."),
    buildGapRow("offer_cta", counts.offer_cta ?? 0, "Offer and CTA content converts attention into action.", "Add more explicit consultation, estimate, or next-step videos."),
    buildGapRow("behind_the_scenes", counts.behind_the_scenes ?? 0, "Behind-the-scenes content builds calm credibility.", "Add more team, process, standards, or company-story content."),
  ];
}

function buildGapRow(theme: string, count: number, strongCopy: string, weakCopy: string) {
  const status = count >= 3 ? "strong" : count >= 1 ? "thin" : "missing";
  return {
    id: theme,
    title: THEME_LABELS[theme] ?? theme,
    status,
    count,
    detail: status === "strong" ? strongCopy : weakCopy,
  };
}

function summarizeThemes(videos: YouTubeVideoInsight[]) {
  const counts = videos.reduce<Record<string, number>>((acc, video) => {
    acc[video.trustTheme] = (acc[video.trustTheme] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([key]) => THEME_LABELS[key] ?? key);
}

function buildFounderSummary({
  channelTitle,
  recent30Count,
  recent90Count,
  averageViews,
  medianViews,
  bestRecent,
  dominantThemes,
  contentGaps,
  importMode,
}: {
  channelTitle: string;
  recent30Count: number;
  recent90Count: number;
  averageViews: number | null;
  medianViews: number | null;
  bestRecent: YouTubeVideoInsight | null;
  dominantThemes: string[];
  contentGaps: Array<{ title: string; status: string }>;
  importMode: "youtube_live_api" | "youtube_limited_rss";
}) {
  const weakestGap = contentGaps.find((gap) => gap.status !== "strong");
  const sourceLine =
    importMode === "youtube_live_api"
      ? `This report is using live public YouTube metrics for ${channelTitle}.`
      : `This report is using a limited recent-uploads fallback for ${channelTitle}.`;
  const performanceLine =
    averageViews != null && medianViews != null
      ? `${recent30Count} uploads landed in the last 30 days and ${recent90Count} in the last 90. Recent uploads are averaging ${formatInteger(averageViews)} views with a median of ${formatInteger(medianViews)}.`
      : `${recent30Count} uploads landed in the last 30 days and ${recent90Count} in the last 90. Public upload cadence is visible, but detailed view metrics are limited right now.`;
  const winnerLine = bestRecent ? `The strongest recent video is "${bestRecent.title}" and the channel is leaning most heavily on ${dominantThemes.join(" and ").toLowerCase() || "general proof content"}.` : "";
  const gapLine = weakestGap ? `${weakestGap.title} is the clearest content gap to fill next.` : "The current mix is relatively balanced across the main trust themes.";
  return [sourceLine, performanceLine, winnerLine, gapLine].filter(Boolean).join(" ");
}

function inferTrustTheme(title: string, description: string | null, category: string) {
  const text = `${title} ${description ?? ""}`.toLowerCase();
  if (/book|estimate|quote|call now|contact|schedule|request/.test(text)) return "offer_cta";
  if (category === "Founder story") return "behind_the_scenes";
  if (category === "Testimonial") return "testimonial";
  if (category === "Case study" || category === "Product proof") return "project_proof";
  if (["Objection", "FAQ", "Comparison", "Risk reversal"].includes(category)) return "objection_handling";
  if (category === "Education") return "educational";
  return "behind_the_scenes";
}

function buildRecommendationReason(
  video: Pick<YouTubeVideoInsight, "viewCount" | "publishedAt">,
  category: string,
  trustTheme: string
) {
  const parts: string[] = [];
  if (video.viewCount != null) parts.push(`${formatInteger(video.viewCount)} public views`);
  if (video.publishedAt) parts.push(`published ${formatShortDate(video.publishedAt)}`);
  parts.push(`${THEME_LABELS[trustTheme] ?? trustTheme} angle`);
  parts.push(`${category} classification`);
  return parts.join(" • ");
}

async function fetchChannelSnapshot(
  source: Extract<ReturnType<typeof parseSourceUrl>, { platform: "youtube"; kind: "youtube_channel" }>,
  apiKey: string
) {
  const params = new URLSearchParams({ part: "snippet,statistics,contentDetails", key: apiKey, maxResults: "1" });
  if (source.channelId) params.set("id", source.channelId);
  else if (source.handle) params.set("forHandle", source.handle);
  else if (source.legacyUsername) params.set("forUsername", source.legacyUsername);

  const data = await fetchJson<{
    items?: Array<{
      id?: string;
      snippet?: {
        title?: string;
        description?: string;
        customUrl?: string;
        thumbnails?: Record<string, { url?: string }>;
      };
      statistics?: {
        subscriberCount?: string;
        viewCount?: string;
        videoCount?: string;
      };
      contentDetails?: {
        relatedPlaylists?: {
          uploads?: string;
        };
      };
    }>;
  }>(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`);

  const item = data.items?.[0];
  if (!item) throw new Error("Could not resolve that YouTube channel from the public API.");

  const handle = item.snippet?.customUrl?.replace(/^@+/, "") ?? source.handle ?? null;
  return {
    channelId: item.id ?? source.channelId ?? null,
    title: item.snippet?.title ?? null,
    description: item.snippet?.description ?? null,
    handle,
    canonicalUrl: handle ? `https://www.youtube.com/@${handle}` : item.id ? `https://www.youtube.com/channel/${item.id}` : source.canonicalUrl,
    thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
    subscriberCount: toNumber(item.statistics?.subscriberCount),
    totalViews: toNumber(item.statistics?.viewCount),
    totalVideos: toNumber(item.statistics?.videoCount),
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? null,
  };
}

async function fetchPlaylistVideoIds(playlistId: string, apiKey: string, limit: number) {
  const ids: string[] = [];
  let pageToken = "";

  while (ids.length < limit) {
    const params = new URLSearchParams({ part: "contentDetails", key: apiKey, playlistId, maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await fetchJson<{ nextPageToken?: string; items?: Array<{ contentDetails?: { videoId?: string } }> }>(
      `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`
    );
    ids.push(...((data.items ?? []).map((item) => item.contentDetails?.videoId).filter(Boolean) as string[]));
    pageToken = data.nextPageToken ?? "";
    if (!pageToken) break;
  }

  return ids.slice(0, limit);
}

async function fetchVideoRows(videoIds: string[], apiKey: string) {
  if (!videoIds.length) return [];
  const videos: YouTubeChannelSnapshot["videos"] = [];

  for (let index = 0; index < videoIds.length; index += 50) {
    const batch = videoIds.slice(index, index + 50);
    const params = new URLSearchParams({ part: "snippet,contentDetails,statistics,status", key: apiKey, id: batch.join(","), maxResults: "50" });
    const data = await fetchJson<{
      items?: Array<{
        id: string;
        snippet?: {
          title?: string;
          description?: string;
          publishedAt?: string;
          thumbnails?: Record<string, { url?: string }>;
        };
        contentDetails?: { duration?: string };
        statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
        status?: { privacyStatus?: string };
      }>;
    }>(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);

    videos.push(
      ...((data.items ?? [])
        .filter((item) => item.status?.privacyStatus === "public")
        .map((item) => ({
          videoId: item.id,
          title: item.snippet?.title ?? "Untitled YouTube video",
          description: item.snippet?.description ?? null,
          publishedAt: item.snippet?.publishedAt ?? null,
          sourceUrl: `https://www.youtube.com/watch?v=${item.id}`,
          thumbnailUrl:
            item.snippet?.thumbnails?.maxres?.url ??
            item.snippet?.thumbnails?.standard?.url ??
            item.snippet?.thumbnails?.high?.url ??
            `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
          durationSeconds: parseYouTubeDuration(item.contentDetails?.duration),
          viewCount: toNumber(item.statistics?.viewCount),
          likeCount: toNumber(item.statistics?.likeCount),
          commentCount: toNumber(item.statistics?.commentCount),
        })) as YouTubeChannelSnapshot["videos"])
    );
  }

  return videos.sort((left, right) => compareDates(right.publishedAt, left.publishedAt));
}

async function fetchYouTubeRss(url: string, canonicalUrl: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 TrustCompressionBot/1.0" },
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error("No recent public uploads were found for that YouTube channel.");

  const xml = await response.text();
  const channelTitle = decodeXml(firstMatch(xml, /<title>([\s\S]*?)<\/title>/));
  const channelId = firstMatch(xml, /<yt:channelId>([\s\S]*?)<\/yt:channelId>/);
  const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)).slice(0, 15);

  const videos = entries
    .map((entry) => rssEntryToVideo(entry[1]))
    .filter(Boolean) as YouTubeChannelSnapshot["videos"];

  if (!videos.length) throw new Error("No recent public uploads were found for that YouTube channel.");

  return {
    channelTitle,
    channelId,
    canonicalUrl,
    videos,
  };
}

function rssEntryToVideo(entry: string): YouTubeChannelSnapshot["videos"][number] | null {
  const videoId = firstMatch(entry, /<yt:videoId>([\s\S]*?)<\/yt:videoId>/);
  if (!videoId) return null;

  return {
    videoId,
    title: decodeXml(firstMatch(entry, /<title>([\s\S]*?)<\/title>/)) ?? "Untitled YouTube video",
    description: decodeXml(firstMatch(entry, /<media:description>([\s\S]*?)<\/media:description>/)),
    publishedAt: firstMatch(entry, /<published>([\s\S]*?)<\/published>/),
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: firstMatch(entry, /<media:thumbnail[^>]+url="([^"]+)"/) ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationSeconds: null,
    viewCount: null,
    likeCount: null,
    commentCount: null,
  };
}

async function resolveChannelIdFromPage(canonicalUrl: string) {
  const response = await fetch(canonicalUrl, {
    headers: { "User-Agent": "Mozilla/5.0 TrustCompressionBot/1.0" },
    next: { revalidate: 3600 },
  });
  if (!response.ok) return null;
  const html = await response.text();
  const decoded = html.replace(/\\u0026/g, "&").replace(/\\\"/g, '"');
  return (
    firstMatch(decoded, /"channelId":"(UC[^"]+)"/) ??
    firstMatch(decoded, /"browseId":"(UC[^"]+)"/) ??
    firstMatch(decoded, /"externalId":"(UC[^"]+)"/) ??
    firstMatch(decoded, /<meta itemprop="channelId" content="(UC[^"]+)"/) ??
    firstMatch(decoded, /youtube\.com\/channel\/(UC[\w-]+)/)
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { next: { revalidate: 300 } });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? "YouTube fetch failed.");
  return data as T;
}

function getYouTubeProfileUrl(input: SocialProfileAnalysisInput) {
  if (input.profileUrl) return input.profileUrl;
  if (input.username) return `https://www.youtube.com/@${input.username.replace(/^@+/, "")}`;
  return null;
}

function getFirstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function filterSince(videos: YouTubeVideoInsight[], days: number) {
  const threshold = Date.now() - days * 86400000;
  return videos.filter((video) => (video.publishedAt ? Date.parse(video.publishedAt) >= threshold : false));
}

function computeAverage(values: number[]) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function computeMedian(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function pickMax<T>(items: T[], score: (item: T) => number) {
  if (!items.length) return null;
  return [...items].sort((left, right) => score(right) - score(left))[0] ?? null;
}

function pickMin<T>(items: T[], score: (item: T) => number) {
  if (!items.length) return null;
  return [...items].sort((left, right) => score(left) - score(right))[0] ?? null;
}

function compareDates(left: string | null, right: string | null) {
  const leftValue = left ? Date.parse(left) : 0;
  const rightValue = right ? Date.parse(right) : 0;
  return leftValue - rightValue;
}

function firstMatch(input: string, pattern: RegExp) {
  return input.match(pattern)?.[1] ?? null;
}

function decodeXml(value: string | null) {
  if (!value) return null;
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseYouTubeDuration(duration?: string) {
  if (!duration) return null;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function looksLikeChannelId(value: string) {
  return /^UC[\w-]{20,}$/.test(value);
}

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatInteger(value: number | null | undefined) {
  if (value == null) return "0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function platformLabel(platform: string) {
  return platform.charAt(0).toUpperCase() + platform.slice(1).replace(/_/g, " ");
}
