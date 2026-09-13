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

export function JourneyEmbedCode({ shareUrl }: { shareUrl: string }) {
  const [copied, setCopied] = useState(false);
  const [height, setHeight] = useState("760");
  let url = "";
  try {
    const source = new URL(shareUrl);
    if (["https:", "http:"].includes(source.protocol) && source.pathname.startsWith("/share/")) {
      source.pathname = source.pathname.replace("/share/", "/embed/journey/");
      url = source.href;
    }
  } catch {}
  if (!url) return null;
  const escaped = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const code = `<iframe src="${escaped}" title="Explore our work" width="100%" height="${height}" style="border:0;border-radius:16px;" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  return <details className="sage-panel"><summary>Embed on a website or landing page</summary><p>Paste this into an HTML block. Visitors can expand into the full journey; scrolling stays inside the embed when needed.</p><label>Embed height<select value={height} onChange={e => setHeight(e.target.value)}><option value="600">Compact - 600px</option><option value="760">Standard - 760px</option><option value="960">Tall videos / documents - 960px</option></select></label><textarea readOnly value={code} aria-label="Journey embed code" onFocus={e => e.target.select()} /><button onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Embed code copied" : "Copy embed code"}</button></details>;
}
