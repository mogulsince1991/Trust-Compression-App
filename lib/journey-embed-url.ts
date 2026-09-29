export function journeyEmbedUrl(shareUrl: string, options: { customColors: boolean; background: string; text: string; transparent: boolean }) {
  try {
    const url = new URL(shareUrl);
    if (!["https:", "http:"].includes(url.protocol) || !url.pathname.startsWith("/share/")) return "";
    url.pathname = url.pathname.replace("/share/", "/embed/journey/");
    for (const key of ["background", "text", "transparent"]) url.searchParams.delete(key);
    if (options.customColors) {
      url.searchParams.set("background", options.background);
      url.searchParams.set("text", options.text);
    }
    if (options.transparent) url.searchParams.set("transparent", "1");
    return url.href;
  } catch { return ""; }
}
