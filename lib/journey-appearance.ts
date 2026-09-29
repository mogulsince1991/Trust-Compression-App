export type JourneyAppearance = {
  branding: "none" | "trusttale" | "company";
  companyName: string; logoUrl: string; websiteUrl: string;
  theme: "dark" | "light" | "custom";
  background: string; text: string; accent: string; buttonText: string;
  font: "modern" | "classic" | "editorial";
  layout: "compact" | "spacious"; showContents: boolean;
};
export function safeBrandUrl(value: unknown) {
  try { const url = new URL(String(value || "")); return url.protocol === "https:" && !url.username && !url.password ? url.href : ""; } catch { return ""; }
}
export function normalizeAppearance(value: unknown): JourneyAppearance {
  const a = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const color = (v: unknown, fallback: string) => typeof v === "string" && /^#[\da-f]{6}$/i.test(v) ? v : fallback;
  return {
    branding: a.branding === "company" || a.branding === "trusttale" ? a.branding : "none",
    companyName: typeof a.companyName === "string" ? a.companyName.trim().slice(0, 100) : "",
    logoUrl: safeBrandUrl(a.logoUrl), websiteUrl: safeBrandUrl(a.websiteUrl),
    theme: a.theme === "light" || a.theme === "custom" ? a.theme : "dark",
    background: color(a.background, "#171b18"), text: color(a.text, "#f4f2eb"), accent: color(a.accent, "#5c946e"), buttonText: color(a.buttonText, "#ffffff"),
    font: a.font === "classic" || a.font === "editorial" ? a.font : "modern",
    layout: a.layout === "compact" ? "compact" : "spacious", showContents: a.showContents !== false
  };
}
export function appearanceColors(a: JourneyAppearance) {
  return a.theme === "light" ? { background: "#f5f5f1", text: "#272727" } : a.theme === "dark" ? { background: "#171b18", text: "#f4f2eb" } : a;
}
