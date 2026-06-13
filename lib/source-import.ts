export type YouTubeImportKind = "youtube_video" | "youtube_playlist" | "youtube_channel";

export type ImportedVideo = {
  externalId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  sourceUrl: string;
  embedUrl: string;
  channelTitle: string | null;
  metadata: Record<string, unknown>;
};

export type ParsedSource =
  | { platform: "youtube"; kind: "youtube_video"; videoId: string; canonicalUrl: string }
  | { platform: "youtube"; kind: "youtube_playlist"; playlistId: string; canonicalUrl: string }
  | { platform: "youtube"; kind: "youtube_channel"; channelId?: string; handle?: string; canonicalUrl: string };

export function parseSourceUrl(rawUrl: string): ParsedSource {
  let url: URL;

  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("Paste a valid public YouTube URL.");
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const videoId = url.pathname.split("/").filter(Boolean)[0];
    if (!videoId) throw new Error("Could not read the YouTube video ID.");
    return {
      platform: "youtube",
      kind: "youtube_video",
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`
    };
  }

  if (!["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
    throw new Error("This first importer supports YouTube links. Drive and Meta sources come next.");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const playlistId = url.searchParams.get("list");

  if (url.pathname === "/watch" && url.searchParams.get("v")) {
    const videoId = url.searchParams.get("v") as string;
    return {
      platform: "youtube",
      kind: "youtube_video",
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`
    };
  }

  if (parts[0] === "shorts" && parts[1]) {
    return {
      platform: "youtube",
      kind: "youtube_video",
      videoId: parts[1],
      canonicalUrl: `https://www.youtube.com/shorts/${parts[1]}`
    };
  }

  if (parts[0] === "playlist" && playlistId) {
    return {
      platform: "youtube",
      kind: "youtube_playlist",
      playlistId,
      canonicalUrl: `https://www.youtube.com/playlist?list=${playlistId}`
    };
  }

  if (parts[0] === "channel" && parts[1]) {
    return {
      platform: "youtube",
      kind: "youtube_channel",
      channelId: parts[1],
      canonicalUrl: `https://www.youtube.com/channel/${parts[1]}`
    };
  }

  if (parts[0]?.startsWith("@")) {
    return {
      platform: "youtube",
      kind: "youtube_channel",
      handle: parts[0].slice(1),
      canonicalUrl: `https://www.youtube.com/${parts[0]}`
    };
  }

  if (playlistId) {
    return {
      platform: "youtube",
      kind: "youtube_playlist",
      playlistId,
      canonicalUrl: `https://www.youtube.com/playlist?list=${playlistId}`
    };
  }

  throw new Error("Use a YouTube video, shorts, playlist, channel, or @handle URL.");
}

export async function importYouTubeSource(source: ParsedSource, apiKey?: string): Promise<ImportedVideo[]> {
  if (source.platform !== "youtube") {
    throw new Error("Unsupported source.");
  }

  if (source.kind === "youtube_video" && !apiKey) {
    return [await importYouTubeVideoWithOEmbed(source.videoId, source.canonicalUrl)];
  }

  if (!apiKey) {
    if (source.kind === "youtube_channel") {
      return importYouTubeChannelWithRss(source);
    }

    throw new Error("Add YOUTUBE_API_KEY in Vercel to import YouTube playlists. Public channel URLs can import recent uploads without a key.");
  }

  if (source.kind === "youtube_video") {
    return fetchYouTubeVideoDetails([source.videoId], apiKey);
  }

  if (source.kind === "youtube_playlist") {
    const ids = await fetchPlaylistVideoIds(source.playlistId, apiKey);
    return fetchYouTubeVideoDetails(ids, apiKey);
  }

  const playlistId = await resolveChannelUploadsPlaylist(source, apiKey);
  const ids = await fetchPlaylistVideoIds(playlistId, apiKey);
  return fetchYouTubeVideoDetails(ids, apiKey);
}

async function importYouTubeVideoWithOEmbed(videoId: string, canonicalUrl: string): Promise<ImportedVideo> {
  const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonicalUrl)}`, {
    next: { revalidate: 3600 }
  });

  if (!response.ok) {
    throw new Error("YouTube could not return public embed data for that video.");
  }

  const data = (await response.json()) as {
    title?: string;
    author_name?: string;
    author_url?: string;
    thumbnail_url?: string;
    provider_name?: string;
  };

  return {
    externalId: videoId,
    title: data.title ?? "Untitled YouTube video",
    description: null,
    thumbnailUrl: data.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationSeconds: null,
    publishedAt: null,
    sourceUrl: canonicalUrl,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
    channelTitle: data.author_name ?? null,
    metadata: {
      provider: data.provider_name ?? "YouTube",
      authorUrl: data.author_url ?? null,
      importMode: "oembed"
    }
  };
}

async function importYouTubeChannelWithRss(source: Extract<ParsedSource, { kind: "youtube_channel" }>) {
  const channelId = source.channelId ?? (source.handle ? await resolveChannelIdFromHandle(source.handle, source.canonicalUrl) : null);
  if (!channelId) {
    throw new Error("Could not resolve that YouTube channel. Try a /channel/UC... URL or add YOUTUBE_API_KEY for handle import.");
  }

  const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
    next: { revalidate: 300 }
  });

  if (!response.ok) {
    throw new Error("YouTube RSS could not return recent public uploads for that channel.");
  }

  const xml = await response.text();
  const channelTitle = decodeXml(firstMatch(xml, /<title>([\s\S]*?)<\/title>/));
  const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)).slice(0, 15);

  const videos = entries
    .map((entry) => rssEntryToVideo(entry[1], channelTitle, channelId))
    .filter(Boolean) as ImportedVideo[];

  if (!videos.length) {
    throw new Error("No recent public uploads were found for that YouTube channel.");
  }

  return videos;
}

function rssEntryToVideo(entry: string, channelTitle: string | null, channelId: string): ImportedVideo | null {
  const videoId = firstMatch(entry, /<yt:videoId>([\s\S]*?)<\/yt:videoId>/);
  if (!videoId) return null;

  const title = decodeXml(firstMatch(entry, /<title>([\s\S]*?)<\/title>/)) ?? "Untitled YouTube video";
  const publishedAt = firstMatch(entry, /<published>([\s\S]*?)<\/published>/);
  const description = decodeXml(firstMatch(entry, /<media:description>([\s\S]*?)<\/media:description>/));
  const thumbnailUrl = firstMatch(entry, /<media:thumbnail[^>]+url="([^"]+)"/);

  return {
    externalId: videoId,
    title,
    description,
    thumbnailUrl: thumbnailUrl ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationSeconds: null,
    publishedAt,
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
    channelTitle,
    metadata: {
      channelId,
      captionAvailable: null,
      importMode: "youtube_rss",
      rssFallback: true
    }
  };
}

async function resolveChannelIdFromHandle(handle: string, canonicalUrl: string) {
  const response = await fetch(canonicalUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 TrustCompressionBot/1.0"
    },
    next: { revalidate: 3600 }
  });

  if (!response.ok) return null;
  const html = await response.text();
  return firstMatch(html, /"channelId":"(UC[^"]+)"/) ?? firstMatch(html, /<meta itemprop="channelId" content="(UC[^"]+)"/);
}

async function resolveChannelUploadsPlaylist(source: Extract<ParsedSource, { kind: "youtube_channel" }>, apiKey: string) {
  const params = new URLSearchParams({
    part: "contentDetails,snippet",
    key: apiKey,
    maxResults: "1"
  });

  if (source.channelId) {
    params.set("id", source.channelId);
  } else if (source.handle) {
    params.set("forHandle", source.handle);
  }

  const data = await fetchYouTube<{ items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> }>(
    `https://www.googleapis.com/youtube/v3/channels?${params.toString()}`
  );

  const uploads = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("Could not find the public uploads playlist for that YouTube channel.");
  return uploads;
}

async function fetchPlaylistVideoIds(playlistId: string, apiKey: string) {
  const ids: string[] = [];
  let pageToken = "";

  while (ids.length < 50) {
    const params = new URLSearchParams({
      part: "contentDetails",
      key: apiKey,
      playlistId,
      maxResults: "50"
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await fetchYouTube<{ nextPageToken?: string; items?: Array<{ contentDetails?: { videoId?: string } }> }>(
      `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`
    );

    ids.push(...(data.items ?? []).map((item) => item.contentDetails?.videoId).filter(Boolean) as string[]);
    pageToken = data.nextPageToken ?? "";
    if (!pageToken) break;
  }

  return ids.slice(0, 50);
}

async function fetchYouTubeVideoDetails(videoIds: string[], apiKey: string) {
  if (!videoIds.length) return [];
  const videos: ImportedVideo[] = [];

  for (let index = 0; index < videoIds.length; index += 50) {
    const batch = videoIds.slice(index, index + 50);
    const params = new URLSearchParams({
      part: "snippet,contentDetails,player,status",
      key: apiKey,
      id: batch.join(","),
      maxResults: "50"
    });

    const data = await fetchYouTube<{
      items?: Array<{
        id: string;
        snippet?: {
          title?: string;
          description?: string;
          publishedAt?: string;
          channelTitle?: string;
          channelId?: string;
          thumbnails?: Record<string, { url?: string }>;
          tags?: string[];
        };
        contentDetails?: { duration?: string; caption?: string; definition?: string };
        status?: { embeddable?: boolean; privacyStatus?: string };
        player?: { embedHtml?: string };
      }>;
    }>(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);

    videos.push(
      ...(data.items ?? [])
        .filter((item) => item.status?.privacyStatus === "public")
        .map((item) => ({
          externalId: item.id,
          title: item.snippet?.title ?? "Untitled YouTube video",
          description: item.snippet?.description ?? null,
          thumbnailUrl:
            item.snippet?.thumbnails?.maxres?.url ??
            item.snippet?.thumbnails?.standard?.url ??
            item.snippet?.thumbnails?.high?.url ??
            `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
          durationSeconds: parseYouTubeDuration(item.contentDetails?.duration),
          publishedAt: item.snippet?.publishedAt ?? null,
          sourceUrl: `https://www.youtube.com/watch?v=${item.id}`,
          embedUrl: `https://www.youtube.com/embed/${item.id}`,
          channelTitle: item.snippet?.channelTitle ?? null,
          metadata: {
            channelId: item.snippet?.channelId ?? null,
            tags: item.snippet?.tags ?? [],
            captionAvailable: item.contentDetails?.caption === "true",
            embeddable: item.status?.embeddable ?? null,
            definition: item.contentDetails?.definition ?? null,
            importMode: "youtube_api"
          }
        }))
    );
  }

  return videos;
}

async function fetchYouTube<T>(url: string): Promise<T> {
  const response = await fetch(url, { next: { revalidate: 300 } });
  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message ?? "YouTube import failed.";
    throw new Error(message);
  }

  return data as T;
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
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}
