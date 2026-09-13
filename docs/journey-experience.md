# Journey presentation

The public viewer now has separate standalone and inline-embed presentations. Both use explicit activation: no video or iframe loads before the buyer opens an asset. Drive uses its provider preview instead of proxying the original file through Vercel. Thumbnails use saved metadata; missing or inaccessible thumbnails have a title-based placeholder.

Portrait stages use 9:16 dimensions, landscape stages use 16:9, and documents have a tall reading area. Buttons remain outside the media. Only standalone video-stage swipes navigate; document scrolling and embed/host-page scrolling never navigate. Third-party iframes capture their own gestures, so accessible buttons are always available.

An optional, browser-local resume prompt remembers the asset and (for measurable players) playback position. Drive and document embeds resume to the asset, not an unobservable in-frame position. This is not recipient identification. Actual end events advance supported videos. The last video's end presents the next step.

The journey editor offers desktop, narrow-width, and inline previews using the real viewer with analytics disabled. Basic preflight checks surface invalid URLs, missing thumbnails, and absent CTA configuration; they do not claim to validate public file permissions or provider embedding restrictions. Published journeys have copyable lazy-loaded iframe code with selectable height.

Not included: custom client domains, new revision-storage/publishing semantics, automatic host-page resizing, new journey templates, or a new CRM attribution engine. Drive's internal overlays, quality selection and playback telemetry remain provider-controlled. Network/provider verification on a real shared journey is still required.

Local visual fixture: `node scripts/journey-preview-server.cjs` serves sample-only content on 127.0.0.1:3132. It never connects to production data and runs the viewer in preview mode.
