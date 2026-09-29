"use client";
import { normalizeAppearance, appearanceColors, type JourneyAppearance } from "@/lib/journey-appearance";

export function JourneyAppearanceEditor({ value, onChange }: { value?: JourneyAppearance; onChange: (value: JourneyAppearance) => void }) {
  const a = { ...normalizeAppearance(value), ...value };
  const colors = appearanceColors(normalizeAppearance(a));
  const change = (patch: Partial<JourneyAppearance>) => onChange({ ...a, ...patch });
  return <section className="sage-panel sage-form"><h2>Journey appearance</h2><p>Style your customer-facing page. Video sizing stays automatic.</p>
    <label>Include branding<select value={a.branding} onChange={e => change({ branding: e.target.value as JourneyAppearance["branding"] })}><option value="none">None</option><option value="company">My company</option><option value="trusttale">TrustTale, an app by Unmarked</option></select></label>
    {a.branding === "company" && <><label>Company name<input value={a.companyName} onChange={e => change({ companyName: e.target.value })} /></label><label>Logo link (HTTPS)<input type="url" value={a.logoUrl} onChange={e => onChange({ ...a, logoUrl: e.target.value })} placeholder="https://example.com/logo.png" /></label><label>Company website (HTTPS)<input type="url" value={a.websiteUrl} onChange={e => onChange({ ...a, websiteUrl: e.target.value })} /></label><small>Use a publicly accessible logo image. Invalid or incomplete URLs are not displayed.</small></>}
    <label>Theme<select value={a.theme} onChange={e => change({ theme: e.target.value as JourneyAppearance["theme"] })}><option value="dark">Dark</option><option value="light">Light</option><option value="custom">Custom colors</option></select></label>
    <div className="sage-form-columns">{(["background", "text", "accent", "buttonText"] as const).map(key => <label key={key}>{({ background: "Background", text: "Text", accent: "Button / accent", buttonText: "Button text" })[key]}<input type="color" value={key === "background" || key === "text" ? colors[key] : a[key]} onChange={e => change(key === "background" || key === "text" ? { theme: "custom", background: colors.background, text: colors.text, [key]: e.target.value } : { [key]: e.target.value })} /></label>)}</div>
    <label>Font<select value={a.font} onChange={e => change({ font: e.target.value as JourneyAppearance["font"] })}><option value="modern">Modern sans serif</option><option value="classic">Classic serif</option><option value="editorial">Editorial serif</option></select></label>
    <label>Spacing<select value={a.layout} onChange={e => change({ layout: e.target.value as JourneyAppearance["layout"] })}><option value="spacious">Spacious</option><option value="compact">Compact</option></select></label>
    <label><input type="checkbox" checked={a.showContents} onChange={e => change({ showContents: e.target.checked })} />Show contents list</label><p>Branding appears at the bottom of the journey. Button colors apply to your next-action button; add its destination in Details. Save changes to update the live page.</p>
  </section>;
}
