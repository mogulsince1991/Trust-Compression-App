# Journey presentation

The public viewer now has separate standalone and inline-embed presentations. Both use explicit activation: no video or iframe loads before the buyer opens an asset. Drive uses its provider preview instead of proxying the original file through Vercel. Thumbnails use saved metadata; missing or inaccessible thumbnails have a title-based placeholder.

Portrait stages use 9:16 dimensions, landscape stages use 16:9, and documents have a tall reading area. Buttons remain outside the media. Only standalone video-stage swipes navigate; document scrolling and embed/host-page scrolling never navigate. Third-party iframes capture their own gestures, so accessible buttons are always available.

An optional, browser-local resume prompt remembers the asset and (for measurable players) playback position. Drive and document embeds resume to the asset, not an unobservable in-frame position. This is not recipient identification. Actual end events advance supported videos. The last video's end presents the next step.

The journey editor offers desktop, narrow-width, and inline previews using the real viewer with analytics disabled. Basic preflight checks surface invalid URLs, missing thumbnails, and absent CTA configuration; they do not claim to validate public file permissions or provider embedding restrictions. Published journeys have copyable lazy-loaded iframe code with selectable height.

Not included: custom client domains, new revision-storage/publishing semantics, new journey templates, or a new CRM attribution engine. Drive's internal overlays, quality selection and playback telemetry remain provider-controlled. Network/provider verification on a real shared journey is still required.

Local visual fixture: `node scripts/journey-preview-server.cjs` serves sample-only content on 127.0.0.1:3132 and a cross-origin host on port 3133. It never connects to production data. Standalone previews disable analytics; embedded fixtures send events only to a local no-op endpoint.

## Website embeds

The copyable snippet now defaults to automatic height with `data-trusttale-embed` and `/trusttale-embed.js`. Existing snippets must be replaced to opt in. Builders blocking scripts can use the fixed-height option; scrolling remains available. Do not disable iframe scrolling as a workaround.

The helper validates message origin, frame source, version and height. It supports multiple frames and duplicate script insertion. Dynamically mounted viewers initiate their own handshake. The child accepts initialization only from its parent and sends dimensions only, not visitor identity or analytics. Host CSP must allow the script and frame origin; sandboxed opaque-origin frames cannot negotiate automatic height.

Embed media sizing uses width/aspect ratio, not iframe viewport height, avoiding resize feedback loops. Opening a full journey uses the same share token and selected asset in a new tab. It does not merge analytics sessions or transfer third-party playback position. Queue navigation scrolls only the queue, not the host landing page.

Checks: `node scripts/journey-embed-test.cjs`, `node scripts/playback-viewer-test.cjs`, production Next build. Local browser check: automatic height adjusted from 760 to 1035px on desktop and 888px on mobile; no horizontal overflow or console errors. Browser interaction tooling prevented completing navigation-click checks; real provider playback remains unverified in this pass.
