export const ANALYTICS_EXCLUSION_KEY = "trusttale-exclude-analytics";
export function browserExcluded() {
  const cookie = typeof document !== "undefined" ? document.cookie.match(/(?:^|;\s*)tt_exclude=([01])(?:;|$)/) : null;
  if (cookie) return cookie[1] === "1";
  try { return localStorage.getItem(ANALYTICS_EXCLUSION_KEY) === "1"; } catch { return false; }
}
export function setBrowserExcluded(excluded: boolean) {
  localStorage.setItem(ANALYTICS_EXCLUSION_KEY, excluded ? "1" : "0");
  const host = location.hostname;
  const domain = host === "trusttale.co" || host.endsWith(".trusttale.co") ? "; Domain=trusttale.co" : "";
  document.cookie = `tt_exclude=${excluded ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax; Secure${domain}`;
}
