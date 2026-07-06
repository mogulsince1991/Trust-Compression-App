export type JourneyAssetType =
  | "video"
  | "pdf"
  | "google_doc"
  | "google_sheet"
  | "google_slide"
  | "google_drive_file"
  | "office_doc"
  | "embed";

export type NormalizedJourneyEmbed = {
  assetType: JourneyAssetType;
  sourcePlatform: string;
  title: string;
  sourceUrl: string;
  embedUrl: string;
  thumbnailUrl: string | null;
  metadata: Record<string, unknown>;
};

const OFFICE_EXTENSIONS = new Set(["doc", "docx", "ppt", "pptx", "xls", "xlsx"]);

export function normalizeJourneyEmbed(input: { url: string; title?: string | null }) {
  const rawInput = input.url.trim();
  if (!rawInput) throw new Error("Add a cloud URL or iframe embed code before inserting an asset.");

  const iframeEmbed = readIframeEmbed(rawInput);
  const sourceUrl = iframeEmbed?.src ?? rawInput;

  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch (_error) {
    throw new Error("That asset URL or iframe embed code is not valid.");
  }

  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname;
  const title = input.title?.trim() || iframeEmbed?.title || buildFallbackTitle(url);

  if (hostname.includes("youtube.com") || hostname === "youtu.be") {
    const videoId = readYouTubeVideoId(url);
    if (!videoId) throw new Error("That YouTube URL could not be converted into an embeddable player.");
    return {
      assetType: "video" as const,
      sourcePlatform: "youtube",
      title,
      sourceUrl,
      embedUrl: `https://www.youtube.com/embed/${videoId}?playsinline=1`,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      metadata: { provider: "youtube", videoId }
    };
  }

  if (hostname === "docs.google.com") {
    const documentId = readGoogleDocId(pathname, "document");
    if (documentId) {
      return {
        assetType: "google_doc",
        sourcePlatform: "google_docs",
        title,
        sourceUrl,
        embedUrl: `https://docs.google.com/document/d/${documentId}/preview`,
        thumbnailUrl: null,
        metadata: { provider: "google_docs", documentId }
      };
    }

    const sheetId = readGoogleDocId(pathname, "spreadsheets");
    if (sheetId) {
      return {
        assetType: "google_sheet",
        sourcePlatform: "google_sheets",
        title,
        sourceUrl,
        embedUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/preview`,
        thumbnailUrl: null,
        metadata: { provider: "google_sheets", sheetId }
      };
    }

    const slideId = readGoogleDocId(pathname, "presentation");
    if (slideId) {
      return {
        assetType: "google_slide",
        sourcePlatform: "google_slides",
        title,
        sourceUrl,
        embedUrl: `https://docs.google.com/presentation/d/${slideId}/preview`,
        thumbnailUrl: null,
        metadata: { provider: "google_slides", slideId }
      };
    }
  }

  if (hostname === "drive.google.com") {
    const fileId = readDriveFileId(url);
    if (fileId) {
      return {
        assetType: "google_drive_file",
        sourcePlatform: "google_drive",
        title,
        sourceUrl,
        embedUrl: `https://drive.google.com/file/d/${fileId}/preview`,
        thumbnailUrl: null,
        metadata: { provider: "google_drive", fileId }
      };
    }
  }

  const extension = readExtension(pathname);
  if (extension === "pdf") {
    return {
      assetType: "pdf",
      sourcePlatform: hostname.replace(/^www\./, ""),
      title,
      sourceUrl,
      embedUrl: sourceUrl,
      thumbnailUrl: null,
      metadata: { provider: hostname, extension }
    };
  }

  if (OFFICE_EXTENSIONS.has(extension)) {
    return {
      assetType: "office_doc",
      sourcePlatform: hostname.replace(/^www\./, ""),
      title,
      sourceUrl,
      embedUrl: `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(sourceUrl)}`,
      thumbnailUrl: null,
      metadata: { provider: hostname, extension, viewer: "google_docs" }
    };
  }

  if (
    iframeEmbed ||
    pathname.includes("/embed") ||
    pathname.includes("/preview") ||
    url.searchParams.has("embed") ||
    hostname.includes("gamma.app")
  ) {
    return {
      assetType: "embed",
      sourcePlatform: hostname.replace(/^www\./, ""),
      title,
      sourceUrl,
      embedUrl: sourceUrl,
      thumbnailUrl: null,
      metadata: { provider: hostname, mode: iframeEmbed ? "iframe_embed" : "direct_embed" }
    };
  }

  throw new Error("That link is not a supported embeddable asset yet. Use a public YouTube, Google Docs/Sheets/Slides, Google Drive file, PDF, Office doc, Gamma embed, iframe embed code, or direct embed URL.");
}

export function formatJourneyAssetTypeLabel(assetType: JourneyAssetType) {
  return assetType.replace(/_/g, " ");
}

function buildFallbackTitle(url: URL) {
  const lastSegment = url.pathname.split("/").filter(Boolean).pop();
  if (!lastSegment) return url.hostname.replace(/^www\./, "");
  return decodeURIComponent(lastSegment).replace(/[-_]+/g, " ");
}

function readYouTubeVideoId(url: URL) {
  const host = url.hostname.toLowerCase();
  if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
  if (url.pathname.startsWith("/watch")) return url.searchParams.get("v");
  if (url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2] ?? null;
  if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2] ?? null;
  return null;
}

function readGoogleDocId(pathname: string, kind: "document" | "spreadsheets" | "presentation") {
  const match = pathname.match(new RegExp(`/${kind}/d/([^/]+)`));
  return match?.[1] ?? null;
}

function readDriveFileId(url: URL) {
  const directMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
  if (directMatch?.[1]) return directMatch[1];
  return url.searchParams.get("id");
}

function readExtension(pathname: string) {
  const segment = pathname.split("/").filter(Boolean).pop() ?? "";
  const parts = segment.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

function readIframeEmbed(input: string) {
  if (!/<iframe/i.test(input)) return null;

  const srcMatch = input.match(/src=(["'])(.*?)\1/i);
  const titleMatch = input.match(/title=(["'])(.*?)\1/i);
  const src = srcMatch?.[2]?.trim();

  if (!src) {
    throw new Error("That iframe embed code is missing a src URL.");
  }

  return {
    src,
    title: titleMatch?.[2]?.trim() || null
  };
}
