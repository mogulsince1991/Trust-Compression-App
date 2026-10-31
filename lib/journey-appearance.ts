export type JourneyAppearance = {
  journeyType: "collection" | "landing";
  confirmationLabel: string; preparationSteps: string; resourcesHeading: string;
  calendarUrl: string;
  alignment: "left" | "center"; headerLogoUrl: string;
  headlineGradient: boolean; buttonGradient: boolean; gradientEnd: string;
  buttonStyle: "rounded" | "pill" | "square";
  titleOverrides: Record<string, string>;
  googleTagId: string; metaPixelId: string;
  resultsHeading: string; resultsText: string; resultsUrl: string; resultsButton: string; aboutText: string;
  branding: "none" | "trusttale" | "company";
  companyName: string; logoUrl: string; websiteUrl: string;
  theme: "dark" | "light" | "custom";
  background: string; text: string; accent: string; buttonText: string;
  font: "modern" | "classic" | "editorial" | "humanist" | "geometric" | "slab";
  layout: "compact" | "spacious"; showContents: boolean;
};
export function safeBrandUrl(value: unknown) {
  try { const url = new URL(String(value || "")); return url.protocol === "https:" && !url.username && !url.password ? url.href : ""; } catch { return ""; }
}
export function normalizeAppearance(value: unknown): JourneyAppearance {
  const a = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const color = (v: unknown, fallback: string) => typeof v === "string" && /^#[\da-f]{6}$/i.test(v) ? v : fallback;
  return {
    resultsHeading: typeof a.resultsHeading === "string" ? a.resultsHeading.slice(0,160) : "",
    resultsText: typeof a.resultsText === "string" ? a.resultsText.slice(0,2000) : "",
    resultsUrl: safeBrandUrl(a.resultsUrl),
    resultsButton: typeof a.resultsButton === "string" ? a.resultsButton.slice(0,100) : "See customer results",
    aboutText: typeof a.aboutText === "string" ? a.aboutText.slice(0,4000) : "",
    alignment: a.alignment === "left" ? "left" : "center",
    headerLogoUrl: safeBrandUrl(a.headerLogoUrl),
    headlineGradient: a.headlineGradient === true, buttonGradient: a.buttonGradient === true,
    gradientEnd: color(a.gradientEnd, "#faa916"),
    buttonStyle: a.buttonStyle === "pill" || a.buttonStyle === "square" ? a.buttonStyle : "rounded",
    titleOverrides: Object.fromEntries(Object.entries(a.titleOverrides && typeof a.titleOverrides === "object" ? a.titleOverrides : {}).filter(([k,v]) => k.length <= 2048 && typeof v === "string").slice(0,500).map(([k,v]) => [k, String(v).trim().slice(0,240)])),
    googleTagId: typeof a.googleTagId === "string" && /^(G-[A-Z0-9]+|AW-\d+)$/.test(a.googleTagId.trim()) ? a.googleTagId.trim() : "",
    metaPixelId: typeof a.metaPixelId === "string" && /^\d{5,25}$/.test(a.metaPixelId.trim()) ? a.metaPixelId.trim() : "",
    journeyType: a.journeyType === "landing" ? "landing" : "collection",
    confirmationLabel: typeof a.confirmationLabel === "string" ? a.confirmationLabel.slice(0, 120) : "Thank you. You're in the right place.",
    preparationSteps: typeof a.preparationSteps === "string" ? a.preparationSteps.slice(0, 2000) : "Check your confirmation email for the details.\nWatch the videos relevant to your questions.\nBring your questions to our conversation.",
    resourcesHeading: typeof a.resourcesHeading === "string" ? a.resourcesHeading.slice(0, 160) : "Before we talk, explore these answers",
    calendarUrl: safeBrandUrl(a.calendarUrl),
    branding: a.branding === "company" || a.branding === "trusttale" ? a.branding : "none",
    companyName: typeof a.companyName === "string" ? a.companyName.trim().slice(0, 100) : "",
    logoUrl: safeBrandUrl(a.logoUrl), websiteUrl: safeBrandUrl(a.websiteUrl),
    theme: a.theme === "light" || a.theme === "custom" ? a.theme : "dark",
    background: color(a.background, "#171b18"), text: color(a.text, "#f4f2eb"), accent: color(a.accent, "#5c946e"), buttonText: color(a.buttonText, "#ffffff"),
    font: ["classic", "editorial", "humanist", "geometric", "slab"].includes(String(a.font)) ? a.font as JourneyAppearance["font"] : "modern",
    layout: a.layout === "compact" ? "compact" : "spacious", showContents: a.showContents !== false
  };
}
export function appearanceColors(a: JourneyAppearance) {
  return a.theme === "light" ? { background: "#f5f5f1", text: "#272727" } : a.theme === "dark" ? { background: "#171b18", text: "#f4f2eb" } : a;
}
export function journeyAssetTitleKey(asset: { id: string; libraryAssetId?: string | null; videoId?: string | null; sourceUrl?: string | null }) {
  return asset.libraryAssetId || asset.videoId || asset.sourceUrl || asset.id;
}
export const journeyFonts = {
  modern: '"Avenir Next", "Segoe UI", sans-serif', classic: 'Georgia, serif', editorial: '"Palatino Linotype", Palatino, serif',
  humanist: '"Trebuchet MS", sans-serif', geometric: 'Futura, "Century Gothic", sans-serif', slab: 'Rockwell, "Courier New", serif'
};
