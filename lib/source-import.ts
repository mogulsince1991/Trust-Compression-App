export type SourcePlatform = "youtube" | "google_drive";
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
  | { platform: "youtube"; kind: "youtube_channel"; channelId?: string; handle?: string; legacyUsername?: string; canonicalUrl: string }
  | { platform: "google_drive"; kind: "drive_folder"; folderId: string; canonicalUrl: string }
  | { platform: "google_drive"; kind: "drive_file"; fileId: string; canonicalUrl: string };

export function parseSourceUrl(rawUrl: string): ParsedSource {
  let url: URL;

  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("Paste a valid public YouTube or Google Drive URL.");
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "drive.google.com" || host === "docs.google.com") {
    const folderId = parseDriveFolderId(url);
    if (folderId) {
      return {
        platform: "google_drive",
        kind: "drive_folder",
        folderId,
        canonicalUrl: `https://drive.google.com/drive/folders/${folderId}`
      };
    }

    const fileId = parseDriveFileId(url);
    if (fileId) {
      return {
        platform: "google_drive",
        kind: "drive_file",
        fileId,
        canonicalUrl: `https://drive.google.com/file/d/${fileId}/view`
      };
    }

    throw new Error("Paste a public Google Drive folder URL or a public Drive video file URL.");
  }

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
    throw new Error("This importer supports YouTube links and public Google Drive links.");
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

  if (parts[0] === "user" && parts[1]) {
    return {
      platform: "youtube",
      kind: "youtube_channel",
      legacyUsername: parts[1],
      canonicalUrl: `https://www.youtube.com/user/${parts[1]}`
    };
  }

  if (parts[0] === "c" && parts[1]) {
    return {
      platform: "youtube",
      kind: "youtube_channel",
      handle: parts[1].replace(/^@/, ""),
      canonicalUrl: `https://www.youtube.com/c/${parts[1]}`
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

  throw new Error("Use a YouTube video, shorts, playlist, channel, /user, /c, @handle URL, or a public Drive folder/file URL.");
}

export async function importSourceVideos(source: ParsedSource, options: { youtubeApiKey?: string; driveApiKey?: string } = {}): Promise<ImportedVideo[]> {
  if (source.platform === "google_drive") return importDriveSource(source, options.driveApiKey);
  return importYouTubeSource(source, options.youtubeApiKey);
}

export async function importYouTubeSource(source: Extract<ParsedSource, { platform: "youtube" }>, apiKey?: string): Promise<ImportedVideo[]> {
  if (source.kind === "youtube_video" && !apiKey) {
    return [await importYouTubeVideoWithOEmbed(source.videoId, source.canonicalUrl)];
  }

  if (!apiKey) {
    if (source.kind === "youtube_channel") {
      return importYouTubeChannelWithRss(source);
    }

    throw new Error("Add YOUTUBE_API_KEY in Vercel to import YouTube playlists. Single videos and recent public channel uploads work without a key.");
  }

  if (source.kind === "youtube_video") {
    const videos = await fetchYouTubeVideoDetails([source.videoId], apiKey);
    if (!videos.length) throw new Error("That YouTube video is not public or is not embeddable through the YouTube API.");
    return videos;
  }

  if (source.kind === "youtube_playlist") {
    const ids = await fetchPlaylistVideoIds(source.playlistId, apiKey);
    if (!ids.length) throw new Error("No public videos were found in that YouTube playlist.");
    return fetchYouTubeVideoDetails(ids, apiKey);
  }

  try {
    const playlistId = await resolveChannelUploadsPlaylist(source, apiKey);
    const ids = await fetchPlaylistVideoIds(playlistId, apiKey);
    if (!ids.length) throw new Error("No public uploads were found for that YouTube channel.");
    return fetchYouTubeVideoDetails(ids, apiKey);
  } catch (error) {
    const rssVideos = await importYouTubeChannelWithRss(source).catch(() => []);
    if (rssVideos.length) return rssVideos;
    throw error;
  }
}

async function importDriveSource(source: Extract<ParsedSource, { platform: "google_drive" }>, apiKey?: string): Promise<ImportedVideo[]> {
  if (source.kind === "drive_file") return [driveFileToVideo(source.fileId, null, source.canonicalUrl, "drive_public_file")];
  return importDriveFolder(source, apiKey);
}

async function importDriveFolder(source: Extract<ParsedSource, { kind: "drive_folder" }>, apiKey?: string): Promise<ImportedVideo[]> {
  if (!apiKey) {
    throw new Error("Add GOOGLE_DRIVE_API_KEY or GOOGLE_API_KEY in Vercel to import public Google Drive folders. Single public Drive file links can be added without a key.");
  }

  const params = new URLSearchParams({
    key: apiKey,
    q: `'${source.folderId}' in parents and trashed = false and mimeType contains 'video/'`,
    fields: "files(id,name,mimeType,description,thumbnailLink,webViewLink,webContentLink,createdTime,modifiedTime,size,videoMediaMetadata)",
    pageSize: "100",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true"
  });

  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, { next: { revalidate: 300 } });
  const data = (await response.json()) as {
    error?: { message?: string };
    files?: Array<DriveFile>;
  };

  if (!response.ok) throw new Error(data.error?.message ?? "Google Drive import failed.");
  const files = data.files ?? [];
  if (!files.length) throw new Error("No public video files were found in that Google Drive folder, or the folder is not shared publicly.");

  return files.map((file) => driveFileToVideo(file.id, file, file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`, "drive_public_folder", source.folderId));
}

type DriveFile = {
  id: string;
  name?: string;
  mimeType?: string;
  description?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  videoMediaMetadata?: { durationMillis?: string; width?: number; height?: number };
};

function driveFileToVideo(fileId: string, file: DriveFile | null, sourceUrl: string, importMode: string, folderId?: string): ImportedVideo {
  return {
    externalId: fileId,
    title: file?.name ?? "Google Drive video",
    description: file?.description ?? null,
    thumbnailUrl: file?.thumbnailLink ?? null,
    durationSeconds: file?.videoMediaMetadata?.durationMillis ? Math.round(Number(file.videoMediaMetadata.durationMillis) / 1000) : null,
    publishedAt: file?.createdTime ?? file?.modifiedTime ?? null,
    sourceUrl,
    embedUrl: `https://drive.google.com/file/d/${fileId}/preview`,
    channelTitle: "Google Drive",
    metadata: {
      importMode,
      folderId: folderId ?? null,
      mimeType: file?.mimeType ?? "video/unknown",
      size: file?.size ?? null,
      width: file?.videoMediaMetadata?.width ?? null,
      height: file?.videoMediaMetadata?.height ?? null,
      modifiedTime: file?.modifiedTime ?? null,
      captionAvailable: false,
      publicFileFallback: !file
    }
  };
}

async function importYouTubeVideoWithOEmbed(videoId: string, canonicalUrl: string): Promise<ImportedVideo> {
  const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonicalUrl)}`, {
    next: { revalidate: 3600 }
  });

  if (!response.ok) throw new Error("YouTube could not return public embed data for that video.");

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
    metadata: { provider: data.provider_name ?? "YouTube", authorUrl: data.author_url ?? null, importMode: "oembed" }
  };
}

async function importYouTubeChannelWithRss(source: Extract<ParsedSource, { kind: "youtube_channel" }>) {
  if (source.channelId) return fetchYouTubeRssByChannelId(source.channelId);

  if (source.legacyUsername) {
    const videos = await fetchYouTubeRssByUser(source.legacyUsername);
    if (videos.length) return videos;
  }

  const maybeChannelId = source.handle && looksLikeChannelId(source.handle) ? source.handle : null;
  const channelId = maybeChannelId ?? (source.handle ? await resolveChannelIdFromPage(source.canonicalUrl) : null);
  if (channelId) return fetchYouTubeRssByChannelId(channelId);

  if (source.handle) {
    const videos = await fetchYouTubeRssByUser(source.handle);
    if (videos.length) return videos;
  }

  throw new Error("Could not resolve that YouTube channel for RSS. Try a /channel/UC... URL, or add YOUTUBE_API_KEY for richer handle imports.");
}

async function fetchYouTubeRssByChannelId(channelId: string) {
  return fetchYouTubeRss(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, channelId);
}

async function fetchYouTubeRssByUser(username: string) {
  return fetchYouTubeRss(`https://www.youtube.com/feeds/videos.xml?user=${encodeURIComponent(username)}`, null);
}

async function fetchYouTubeRss(url: string, knownChannelId: string | null) {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 TrustCompressionBot/1.0" }, next: { revalidate: 300 } });
  if (!response.ok) return [];

  const xml = await response.text();
  const channelTitle = decodeXml(firstMatch(xml, /<title>([\s\S]*?)<\/title>/));
  const channelId = knownChannelId ?? firstMatch(xml, /<yt:channelId>([\s\S]*?)<\/yt:channelId>/);
  const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)).slice(0, 15);
  const videos = entries.map((entry) => rssEntryToVideo(entry[1], channelTitle, channelId)).filter(Boolean) as ImportedVideo[];

  if (!videos.length) throw new Error("No recent public uploads were found for that YouTube channel.");
  return videos;
}

function rssEntryToVideo(entry: string, channelTitle: string | null, channelId: string | null): ImportedVideo | null {
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
    metadata: { channelId, captionAvailable: null, importMode: "youtube_rss", rssFallback: true }
  };
}

async function resolveChannelIdFromPage(canonicalUrl: string) {
  const response = await fetch(canonicalUrl, { headers: { "User-Agent": "Mozilla/5.0 TrustCompressionBot/1.0" }, next: { revalidate: 3600 } });
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

async function resolveChannelUploadsPlaylist(source: Extract<ParsedSource, { kind: "youtube_channel" }>, apiKey: string) {
  const params = new URLSearchParams({ part: "contentDetails,snippet", key: apiKey, maxResults: "1" });
  if (source.channelId) params.set("id", source.channelId);
  else if (source.handle) params.set("forHandle", source.handle);
  else if (source.legacyUsername) params.set("forUsername", source.legacyUsername);

  const data = await fetchYouTube<{ items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> }>(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`);
  const uploads = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("Could not find the public uploads playlist for that YouTube channel.");
  return uploads;
}

async function fetchPlaylistVideoIds(playlistId: string, apiKey: string) {
  const ids: string[] = [];
  let pageToken = "";

  while (ids.length < 50) {
    const params = new URLSearchParams({ part: "contentDetails", key: apiKey, playlistId, maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await fetchYouTube<{ nextPageToken?: string; items?: Array<{ contentDetails?: { videoId?: string } }> }>(`https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`);
    ids.push(...((data.items ?? []).map((item) => item.contentDetails?.videoId).filter(Boolean) as string[]));
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
    const params = new URLSearchParams({ part: "snippet,contentDetails,player,status", key: apiKey, id: batch.join(","), maxResults: "50" });
    const data = await fetchYouTube<{
      items?: Array<{
        id: string;
        snippet?: { title?: string; description?: string; publishedAt?: string; channelTitle?: string; channelId?: string; thumbnails?: Record<string, { url?: string }>; tags?: string[] };
        contentDetails?: { duration?: string; caption?: string; definition?: string };
        status?: { embeddable?: boolean; privacyStatus?: string };
      }>;
    }>(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);

    videos.push(
      ...(data.items ?? [])
        .filter((item) => item.status?.privacyStatus === "public")
        .map((item) => ({
          externalId: item.id,
          title: item.snippet?.title ?? "Untitled YouTube video",
          description: item.snippet?.description ?? null,
          thumbnailUrl: item.snippet?.thumbnails?.maxres?.url ?? item.snippet?.thumbnails?.standard?.url ?? item.snippet?.thumbnails?.high?.url ?? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
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
  if (!response.ok) throw new Error(data?.error?.message ?? "YouTube import failed.");
  return data as T;
}

function parseDriveFolderId(url: URL) {
  const parts = url.pathname.split("/").filter(Boolean);
  const folderIndex = parts.indexOf("folders");
  if (folderIndex >= 0 && parts[folderIndex + 1]) return parts[folderIndex + 1];
  return url.searchParams.get("folderId");
}

function parseDriveFileId(url: URL) {
  const parts = url.pathname.split("/").filter(Boolean);
  const fileIndex = parts.indexOf("d");
  if (fileIndex >= 0 && parts[fileIndex + 1]) return parts[fileIndex + 1];
  const openId = url.pathname.includes("/open") ? url.searchParams.get("id") : null;
  const ucId = url.pathname.includes("/uc") ? url.searchParams.get("id") : null;
  return openId ?? ucId ?? null;
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
