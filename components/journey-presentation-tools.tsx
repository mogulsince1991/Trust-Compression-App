"use client";
import { useMemo, useState } from "react";
import { JourneyViewer } from "./journey-viewer";
import type { JourneyAsset, JourneyDraft } from "./trust-app-shared";

function validUrl(value: string | null) {
  try { return ["https:", "http:"].includes(new URL(value ?? "").protocol); } catch { return false; }
}

export function JourneyPresentationPreview({ draft, assets }: { draft: JourneyDraft; assets: JourneyAsset[] }) {
  const [mode, setMode] = useState("desktop");
  const journey = useMemo(() => ({ id: "editor-preview", title: draft.title, heading: draft.heading, description: draft.description, cta_label: draft.ctaLabel, cta_url: validUrl(draft.ctaUrl) ? draft.ctaUrl : null, assets }), [draft, assets]);
  const warnings = assets.flatMap(asset => [
    ...(!validUrl(asset.embedUrl) ? [`${asset.title}: no valid embedded preview URL.`] : []),
    ...(!asset.thumbnailUrl ? [`${asset.title}: using a title placeholder because no thumbnail is saved.`] : []),
  ]);
  if (draft.ctaUrl && !validUrl(draft.ctaUrl)) warnings.push("The next-action button needs a valid http or https URL.");
  if (!draft.ctaUrl) warnings.push("No next-action button is configured.");
  return <section>
    <div className="sage-segments" aria-label="Preview presentation">{["desktop", "phone", "embedded"].map(value => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value}</button>)}</div>
    <p>Interactive preview. No activity is recorded. Phone preview approximates available width; test the published link on your device.</p>
    <details className="sage-panel"><summary>Before you share: {warnings.length ? `${warnings.length} things to review` : "basic checks passed"}</summary>{warnings.map((warning, i) => <p key={i}>{warning}</p>)}<p>Access permissions and provider embedding restrictions are not verified automatically. Open each preview before sharing, especially Drive files.</p></details>
    <div className="jx-preview-wrapper" style={{ maxWidth: mode === "phone" ? 390 : undefined, margin: "16px auto" }}>
      <JourneyViewer key={mode} preview variant={mode === "desktop" ? "share" : "embed"} journey={journey} />
    </div>
  </section>;
}

export function JourneyEmbedCode({ shareUrl, expanded = false }: { shareUrl: string; expanded?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [height, setHeight] = useState("760");
  const [sizing, setSizing] = useState("auto");
  const [copyError, setCopyError] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const [background, setBackground] = useState("#171b18");
  const [textColor, setTextColor] = useState("#f4f2eb");
  let url = "";
  try {
    const source = new URL(shareUrl);
    if (["https:", "http:"].includes(source.protocol) && source.pathname.startsWith("/share/")) {
      source.pathname = source.pathname.replace("/share/", "/embed/journey/");
      source.searchParams.set("background", background);
      source.searchParams.set("text", textColor);
      source.searchParams.set("transparent", transparent ? "1" : "0");
      url = source.href;
    }
  } catch {}
  if (!url) return null;
  const escaped = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const scriptOrigin = new URL(url).origin;
  const code = `<iframe${sizing === "auto" ? " data-trusttale-embed" : ""} src="${escaped}" title="Explore our work" width="100%" height="${height}" style="display:block;border:0;border-radius:16px;" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>${sizing === "auto" ? `\n<script async src="${scriptOrigin}/trusttale-embed.js"></script>` : ""}`;
  return <details className="sage-panel" open={expanded || undefined}><summary>Embed on a website or landing page</summary>
    <p>Paste the full code into a custom HTML block. Automatic height expands the embed to show the whole journey without internal scrollbars. Your page can still scroll normally.</p>
    <div className="sage-form-columns">
      <label><span>Transparent background</span><input type="checkbox" checked={transparent} onChange={event => { setTransparent(event.target.checked); setCopied(false); }} /></label>
      <label>Background color<input type="color" value={background} disabled={transparent} onChange={event => { setBackground(event.target.value); setCopied(false); }} /></label>
      <label>Text color<input type="color" value={textColor} onChange={event => { setTextColor(event.target.value); setCopied(false); }} /></label>
    </div>
    <div style={{ padding: 16, border: "1px solid currentColor", borderRadius: 12, background: transparent ? "repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 / 16px 16px" : background }}><span style={{ color: textColor }}>Your journey headline and text</span></div>
    <p>Colors apply to the journey, not the video or document provider's own player. For transparency, choose text that contrasts with your website.</p>
    <label>Sizing<select value={sizing} onChange={e => { setSizing(e.target.value); setCopied(false); }}><option value="auto">Automatic height (recommended)</option><option value="fixed">Fixed height (no script)</option></select></label>
    <label>{sizing === "auto" ? "Initial / fallback height" : "Embed height"}<select value={height} onChange={e => { setHeight(e.target.value); setCopied(false); }}><option value="600">Compact - 600px</option><option value="760">Standard - 760px</option><option value="960">Tall videos / documents - 960px</option></select></label>
    <p>Visitors can open the full journey in a new tab. If your builder strips scripts, choose fixed height; the journey remains scrollable. Existing embeds need this new snippet for automatic sizing.</p>
    <textarea readOnly value={code} aria-label="Journey embed code" onFocus={e => e.target.select()} />
    <button onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setCopyError(false); } catch { setCopied(false); setCopyError(true); } }}>{copied ? "Embed code copied" : "Copy embed code"}</button>
    <p role="status">{copyError ? "Clipboard access is blocked. Select the code above and copy it manually." : copied ? "Ready to paste into your landing page." : ""}</p>
  </details>;
}
