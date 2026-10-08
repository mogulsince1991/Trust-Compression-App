// Only known document hosts are fetched server-side, never arbitrary submitted URLs.
export function allowedPdfSource(value: string, storageOrigin?: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    if (url.hostname === "file.notion.com" || url.hostname === "prod-files-secure.s3.us-west-2.amazonaws.com") return true;
    return !!storageOrigin && url.origin === new URL(storageOrigin).origin && url.pathname.startsWith("/storage/v1/object/");
  } catch { return false; }
}
