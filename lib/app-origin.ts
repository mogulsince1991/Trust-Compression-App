const APP_HOSTS = new Set(["trusttale.co", "app.trusttale.co", "trustcompression.unmarked.media"]);

// Keep our own saved links in this environment; external destinations stay intact.
export function localAppUrl(value: string, origin: string): string {
  try {
    const url = new URL(value, origin);
    if (!APP_HOSTS.has(url.hostname) || url.username || url.password) return value;
    return new URL(`${url.pathname}${url.search}${url.hash}`, origin).href;
  } catch { return value; }
}

export function appOriginFromHost(host: string | null): string {
  if (host && (APP_HOSTS.has(host) || /^[a-z0-9-]+\.vercel\.app$/.test(host))) return `https://${host}`;
  if (host && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host}`;
  return "https://trusttale.co";
}

export function localReturnPath(value: string | undefined, fallback = "/app/home"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
