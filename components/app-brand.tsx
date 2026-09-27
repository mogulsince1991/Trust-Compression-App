"use client";

export function AppBrand({ onHome }: { onHome?: () => void }) {
  return <div className="sage-brand">
    <a className="sage-wordmark" href="/app/home" onClick={onHome ? event => { if (!event.metaKey && !event.ctrlKey) { event.preventDefault(); onHome(); } } : undefined}>TrustTale<span className="sage-brand-dot" /></a>
    <a className="sage-maker" href="https://unmarked.media" target="_blank" rel="noopener noreferrer" aria-label="TrustTale, an app by Unmarked. Visit Unmarked">
      <span>an app by</span><img className="sage-maker-light" src="/unmarked-black.png" alt="Unmarked" width="500" height="136" /><img className="sage-maker-dark" src="/unmarked-white.png" alt="Unmarked" width="500" height="136" />
    </a>
  </div>;
}
