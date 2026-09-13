"use client";

import { ArrowRight, ChevronLeft, ChevronRight, Play, FileText, List, Maximize2, X, ExternalLink, RotateCcw } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatJourneyAssetLabel, type JourneyAsset } from "@/components/trust-app-shared";
import { PlaybackClock } from "@/lib/playback-clock";
import { loadYouTubePlayer, type YouTubePlayer } from "@/lib/youtube-player";

export type PublicJourney = {
  id: string;
  title: string;
  heading: string | null;
  description: string | null;
  cta_label: string | null;
  cta_url: string | null;
  send_id?: string | null;
  contact_id?: string | null;
  share_token?: string | null;
  assets: JourneyAsset[];
};

type VideoOrientation = "wide" | "portrait" | "adaptive";

export function JourneyViewer({ journey, variant = "share", preview = false }: { journey: PublicJourney; variant?: "share" | "embed"; preview?: boolean }) {
  const [active, setActive] = useState(0);
  const [started, setStarted] = useState(false);
  const [activatedId, setActivatedId] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showContents, setShowContents] = useState(false);
  const [finished, setFinished] = useState(false);
  const [resume, setResume] = useState<{ assetId: string; position: number } | null>(null);
  const [imageOrientation, setImageOrientation] = useState<{ id: string; value: VideoOrientation } | null>(null);
  const positions = useRef<Map<string, number>>(new Map());
  const stageRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const activeAsset = journey.assets[active];
  const listRef = useRef<HTMLDivElement>(null);
  const clocks = useRef<Map<string, PlaybackClock>>(new Map());
  const videoRef = useRef<HTMLVideoElement>(null);
  const youtubeHost = useRef<HTMLDivElement>(null);
  const sessionId = useRef<string>("");
  const trackedOpen = useRef(false);
  const isYouTube = activeAsset?.embedUrl?.includes("youtube.com/embed");
  const orientation = imageOrientation?.id === activeAsset?.id ? imageOrientation.value : activeAsset ? inferOrientation(activeAsset) : "wide";
  const driveFileId = activeAsset?.assetType === "video" ? extractDriveFileId(activeAsset.sourceUrl ?? activeAsset.embedUrl) : null;
  const directVideoUrl = activeAsset?.assetType === "video" && /\.(mp4|webm|mov)(\?|$)/i.test(activeAsset.embedUrl ?? "") ? activeAsset!.embedUrl : null;
  const activated = activatedId === activeAsset?.id;
  const loaded = loadedId === activeAsset?.id;
  const storageKey = `journey-resume:${journey.id}:${journey.send_id ?? "general"}`;

  const embedUrl = useMemo(() => {
    if (!activeAsset?.embedUrl) return "";
    let url: URL;
    try { url = new URL(activeAsset.embedUrl); } catch { return ""; }
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (driveFileId) url = new URL(`https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/preview`);
    if (isYouTube) {
      url.searchParams.set("enablejsapi", "1");
      url.searchParams.set("playsinline", "1");
      url.searchParams.set("autoplay", "1");
      const position = positions.current.get(activeAsset.id);
      if (position) url.searchParams.set("start", String(Math.floor(position)));
      if (typeof window !== "undefined") url.searchParams.set("origin", window.location.origin);
    }
    return url.toString();
  }, [activeAsset?.embedUrl, activeAsset?.id, isYouTube, driveFileId, activated]);

  useEffect(() => {
    setStarted(false);
    setFailed(false);
    setSlow(false);
    setFinished(false);
  }, [activeAsset?.id]);

  useEffect(() => {
    if (!activated || loaded) return;
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, [activated, loaded]);

  useEffect(() => {
    if (preview) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (saved && journey.assets.some(asset => asset.id === saved.assetId) && Number.isFinite(saved.position) && saved.position >= 0) setResume(saved);
    } catch { /* Storage is optional in private browsers and embedded pages. */ }
  }, [storageKey, journey.assets, preview]);

  useEffect(() => {
    if (preview || !activeAsset || !activated) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ assetId: activeAsset.id, position: positions.current.get(activeAsset.id) ?? 0 })); } catch {}
  }, [activeAsset, activated, storageKey, preview]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const item = node.querySelector<HTMLElement>(`[data-index="${active}"]`);
    item?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [active]);

  useEffect(() => {
    if (preview || trackedOpen.current) return;
    trackedOpen.current = true;
    void trackJourneyEvent({
      journey,
      assetId: null,
      videoId: null,
      eventType: "opened",
      viewerId: getViewerId(),
      activeIndex: active,
      metadata: { surface: variant }
    });
  }, [active, journey, variant, preview]);

  useEffect(() => {
    if (!activeAsset?.id || !activated) return;
    const asset = activeAsset;
    const video = videoRef.current;
    const host = youtubeHost.current;
    if (!video && !isYouTube) return;
    if (!sessionId.current) sessionId.current = crypto.randomUUID();
    const key = `${journey.id}:${journey.send_id ?? "general"}:${asset.id}`;
    const clock = clocks.current.get(key) ?? new PlaybackClock();
    clocks.current.set(key, clock);
    clock.resetSample();
    let lastReported = clock.secondsWatched;
    let disposed = false;
    let youtube: YouTubePlayer | null = null;
    const source = video ? "html5_player" : "youtube_player";
    function emit(eventType: "asset_started" | "asset_progress" | "asset_completed") {
      if (preview) return;
      void trackJourneyEvent({ journey, assetId: asset.id, videoId: asset.videoId, eventType,
        viewerId: getViewerId(), activeIndex: active,
        metadata: { ...clock.snapshot(), source, surface: variant, playbackSessionId: sessionId.current } });
    }
    function flush() {
      if (clock.secondsWatched > lastReported) { emit("asset_progress"); lastReported = clock.secondsWatched; }
      if (!preview && !clock.completed) try { localStorage.setItem(storageKey, JSON.stringify({ assetId: asset.id, position: positions.current.get(asset.id) ?? 0 })); } catch {}
    }
    function sample() {
      if (disposed) return;
      try {
        if (!video && !youtube?.getCurrentTime) return;
        const playing = video ? !video.paused && !video.ended && !video.seeking && video.readyState >= 3 : youtube!.getPlayerState() === 1;
        const hadStarted = clock.started;
        positions.current.set(asset.id, video ? video.currentTime : youtube!.getCurrentTime());
        clock.sample({ position: video ? video.currentTime : youtube!.getCurrentTime(),
          duration: video ? video.duration : youtube!.getDuration(), playing,
          rate: video ? video.playbackRate : youtube!.getPlaybackRate(),
          visible: document.visibilityState === "visible", now: performance.now() });
        if (!hadStarted && clock.started) emit("asset_started");
        if (clock.secondsWatched - lastReported >= 10) flush();
      } catch { clock.resetSample(); }
    }
    function pause() { sample(); clock.resetSample(); flush(); setStarted(false); }
    function play() { clock.resetSample(); sample(); setStarted(true); }
    function seek() { clock.resetSample(); flush(); }
    function ended() {
      sample(); flush(); setStarted(false);
      if (clock.started && !clock.completed) { clock.completed = true; emit("asset_completed"); }
      positions.current.set(asset.id, 0);
      setActivatedId(null); setLoadedId(null);
      if (active === journey.assets.length - 1) {
        setFinished(true);
        try { localStorage.removeItem(storageKey); } catch {}
      }
      setActive((current) => current === active ? Math.min(current + 1, journey.assets.length - 1) : current);
    }
    function visibility() { clock.resetSample(); flush(); }
    const listeners: [string, () => void][] = [["playing", play], ["pause", pause], ["waiting", pause], ["stalled", pause], ["seeking", seek], ["seeked", seek], ["ended", ended], ["ratechange", seek]];
    listeners.forEach(([name, handler]) => video?.addEventListener(name, handler));
    if (!video && host && isYouTube) {
      const frame = document.createElement("iframe");
      frame.src = embedUrl;
      frame.title = asset.title;
      frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      frame.allowFullscreen = true;
      frame.onload = () => setLoadedId(asset.id);
      host.replaceChildren(frame);
      void loadYouTubePlayer().then((api) => {
        if (disposed) return;
        youtube = new api.Player(frame, { events: { onStateChange: ({ data }) => {
          if (disposed) return;
          if (data === 1) play(); else if (data === 0) ended(); else pause();
        } } });
      }).catch(() => { /* Playback remains usable when measurement is blocked. */ });
    }
    const timer = window.setInterval(sample, 250);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", visibility);
    return () => {
      sample(); flush(); disposed = true; clock.resetSample();
      window.clearInterval(timer);
      listeners.forEach(([name, handler]) => video?.removeEventListener(name, handler));
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", visibility);
      youtube?.destroy();
      host?.replaceChildren();
    };
  }, [active, activeAsset, journey, variant, isYouTube, activated, embedUrl, storageKey, preview]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { setExpanded(false); setShowContents(false); return; }
      if (event.target instanceof HTMLElement && event.target.closest("input,textarea,select,button,a,[contenteditable],video,iframe")) return;
      if (variant === "embed" && !stageRef.current?.contains(document.activeElement)) return;
      if (event.key === "ArrowRight") { event.preventDefault(); next(); }
      if (event.key === "ArrowLeft") { event.preventDefault(); previous(); }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [journey.assets.length, variant, active]);

  useEffect(() => {
    if (!expanded) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    stageRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [expanded]);

  function onTouchStart(event: React.TouchEvent<HTMLElement>) {
    if (variant === "embed" || activeAsset?.assetType !== "video" || (event.target as HTMLElement).closest("video,iframe,button,a")) return;
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: React.TouchEvent<HTMLElement>) {
    if (!touchStart.current) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStart.current.x;
    const deltaY = touch.clientY - touchStart.current.y;
    const delta = deltaY;
    if (Math.abs(delta) > 65 && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
      if (delta < 0) next();
      else previous();
    }
    touchStart.current = null;
  }

  function next() {
    if (active >= journey.assets.length - 1) return;
    setActivatedId(null); setLoadedId(null);
    setActive((current) => Math.min(current + 1, journey.assets.length - 1));
  }

  function previous() {
    if (active === 0) return;
    setActivatedId(null); setLoadedId(null);
    setActive((current) => Math.max(current - 1, 0));
  }

  function trackCtaClick() {
    if (preview) return;
    void trackJourneyEvent({
      journey,
      assetId: activeAsset?.id ?? null,
      videoId: activeAsset?.videoId ?? null,
      eventType: "cta_clicked",
      viewerId: getViewerId(),
      activeIndex: active,
      metadata: { surface: variant }
    });
  }

  function selectAsset(index: number) { setActive(index); setActivatedId(null); setLoadedId(null); setShowContents(false); }
  function retry() { setActivatedId(null); setLoadedId(null); setFailed(false); setSlow(false); }
  function restart() { positions.current.clear(); selectAsset(0); setResume(null); setFinished(false); try { localStorage.removeItem(storageKey); } catch {} }
  const fullUrl = journey.share_token ? `/share/${encodeURIComponent(journey.share_token)}?asset=${encodeURIComponent(activeAsset?.id ?? "")}` : null;

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("asset");
    const index = journey.assets.findIndex(asset => asset.id === id);
    if (index >= 0) setActive(index);
  }, [journey.assets]);

  if (!activeAsset) return <main className="journey-experience"><p>No content is available in this journey.</p></main>;

  return (
    <main className={`journey-experience is-${orientation} is-${variant}${expanded ? " is-expanded" : ""}${activeAsset.assetType !== "video" ? " is-document" : ""}`}>
      <header className="jx-header">
        <span>{variant === "embed" ? "Explore the proof" : "Selected for you"}</span>
        <h1>{journey.heading || journey.title}</h1>
      </header>
      {resume && <div className="jx-resume"><span>Pick up where you left off on this browser?</span><button onClick={() => { positions.current.set(resume.assetId, resume.position); selectAsset(journey.assets.findIndex(a => a.id === resume.assetId)); setResume(null); }}>Continue</button><button onClick={restart}>Start over</button></div>}
      <div className="jx-layout">
      <section className="jx-stage" ref={stageRef} tabIndex={0} aria-label="Journey player" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="jx-media" key={activeAsset.id}>
          {activated && directVideoUrl ? (
            <video
              ref={videoRef}
              src={directVideoUrl}
              title={activeAsset.title}
              controls
              playsInline
              autoPlay
              preload="metadata"
              poster={activeAsset.thumbnailUrl ?? undefined}
              onLoadedMetadata={event => { const video = event.currentTarget; const position = positions.current.get(activeAsset.id); if (position && position < video.duration) video.currentTime = position; setImageOrientation({ id: activeAsset.id, value: video.videoHeight > video.videoWidth ? "portrait" : "wide" }); }}
              onLoadedData={() => setLoadedId(activeAsset.id)}
              onPlay={() => setStarted(true)}
              onPause={() => setStarted(false)}
              onError={() => setFailed(true)}
            />
          ) : activated && isYouTube ? (
            <div ref={youtubeHost} className="jx-youtube" />
          ) : activated && embedUrl ? (
            <iframe
              key={embedUrl}
              src={embedUrl}
              title={activeAsset.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              onLoad={() => setLoadedId(activeAsset.id)}
              onError={() => setFailed(true)}
            />
          ) : null}
          {(!activated || !loaded || failed) && <div className={`jx-poster${activated && !failed ? " is-loading" : ""}`}>
            {activeAsset.thumbnailUrl && <img src={activeAsset.thumbnailUrl} alt="" onError={e => { e.currentTarget.hidden = true; }} onLoad={e => { const image = e.currentTarget; if (inferOrientation(activeAsset) === "adaptive") setImageOrientation({ id: activeAsset.id, value: image.naturalHeight > image.naturalWidth ? "portrait" : "wide" }); }} />}
            <div className="jx-poster-content">
              {failed ? <><p>We couldn't load this asset.</p><button onClick={retry}><RotateCcw />Try again</button></> : activated ? <p role="status">{slow ? "Taking longer than expected. You can open the original below." : "Loading your content..."}</p> : <><button className="jx-play" disabled={!embedUrl} onClick={() => { setActivatedId(activeAsset.id); setSlow(false); setFailed(false); }} aria-label={`${activeAsset.assetType === "video" ? "Play" : "Read"} ${activeAsset.title}`}>{activeAsset.assetType === "video" ? <Play /> : <FileText />}</button><strong>{activeAsset.title}</strong><span>{embedUrl ? activeAsset.assetType === "video" ? "Tap to play" : "Open document" : "Embedded preview unavailable"}</span></>}
            </div>
          </div>}
        </div>
        <nav className="jx-controls" aria-label="Asset navigation">
          <button onClick={previous} disabled={active === 0} aria-label="Previous asset"><ChevronLeft /></button>
          <button className="jx-counter" onClick={() => setShowContents(v => !v)} aria-expanded={showContents}><List />{active + 1} of {journey.assets.length}<span>View all</span></button>
          <button onClick={() => setExpanded(v => !v)} aria-label={expanded ? "Close expanded view" : "Expand viewer"}>{expanded ? <X /> : <Maximize2 />}</button>
          <button onClick={next} disabled={active === journey.assets.length - 1} aria-label="Next asset"><ChevronRight /></button>
        </nav>
        {(slow || failed) && <div className="jx-help"><button onClick={retry}>Reload preview</button><span>Some providers require public sharing permissions.</span></div>}
      </section>
      <aside className="jx-details">
        <span className="jx-kind">{formatJourneyAssetLabel(activeAsset)}{activeAsset.durationSeconds ? ` / ${Math.ceil(activeAsset.durationSeconds / 60)} min` : ""}</span>
        <h2 aria-live="polite">{activeAsset.title}</h2>
        {(activeAsset.note || activeAsset.summary || journey.description) && <details className="jx-context"><summary>About this {activeAsset.assetType === "video" ? "video" : "document"}</summary><p>{activeAsset.note || activeAsset.summary || journey.description}</p></details>}
        {activeAsset.sourceUrl && <a className="jx-original" href={activeAsset.sourceUrl} target="_blank" rel="noreferrer">Open original<ExternalLink size={16} /></a>}
        {variant === "embed" && fullUrl && <a className="jx-original" href={fullUrl} target="_blank" rel="noreferrer">Open full journey<ExternalLink size={16} /></a>}
      <section className={`jx-contents${showContents ? " is-open" : ""}`} ref={listRef} aria-label="Journey contents">
        {journey.assets.map((asset, index) => (
          <button className={index === active ? "is-active" : ""} aria-current={index === active ? "step" : undefined} key={asset.id} data-index={index} onClick={() => selectAsset(index)}>
            <span>{index + 1}</span>
            <strong>{asset.title}</strong>
          </button>
        ))}
      </section>
      </aside>
      </div>
      <footer className="jx-footer">
        <div>{finished ? <><strong>Ready for the next step?</strong><button onClick={restart}>Watch again</button></> : <span>{activeAsset.assetType !== "video" ? "Read at your own pace. Use the arrows to continue." : variant === "embed" ? "Explore at your own pace." : "Your proof, one story at a time."}</span>}</div>
      {journey.cta_url && (
        <a className="jx-cta" href={journey.cta_url} onClick={trackCtaClick} target="_blank" rel="noreferrer">
          {journey.cta_label || "Continue"} <ArrowRight size={18} />
        </a>
      )}
      </footer>
    </main>
  );
}

function inferOrientation(asset: JourneyAsset): VideoOrientation {
  const metadataOrientation = String(asset.metadata?.orientation ?? asset.metadata?.aspectRatio ?? "").toLowerCase();
  const width = Number(asset.metadata?.width ?? asset.metadata?.videoWidth ?? 0);
  const height = Number(asset.metadata?.height ?? asset.metadata?.videoHeight ?? 0);
  const source = `${asset.sourceUrl ?? ""} ${asset.embedUrl ?? ""} ${asset.title ?? ""}`.toLowerCase();
  if (asset.assetType !== "video") return "wide";
  if (
    metadataOrientation.includes("portrait")
    || metadataOrientation === "9:16"
    || metadataOrientation === "9/16"
    || (width > 0 && height > width)
    || source.includes("/shorts/")
    || source.includes("youtube.com/shorts")
    || source.includes("instagram.com/reel")
    || source.includes("tiktok.com")
    || source.includes("vertical")
    || source.includes("portrait")
  ) return "portrait";
  if (source.includes("drive.google.com") || asset.sourcePlatform.toLowerCase().includes("drive")) return "adaptive";
  return "wide";
}

function extractDriveFileId(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
      if (url.hostname !== "drive.google.com") return null;
    const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    return fileMatch?.[1] ?? url.searchParams.get("id");
  } catch {
    return null;
  }
}

let transientViewerId: string | null = null;
function getViewerId() {
  const key = "trust_viewer_id";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const next = transientViewerId ?? crypto.randomUUID();
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    transientViewerId ??= crypto.randomUUID();
    return transientViewerId;
  }
}

type JourneyEventPayload = {
  journey: PublicJourney;
  assetId: string | null;
  videoId: string | null;
  eventType: "opened" | "video_started" | "video_completed" | "video_progress" | "asset_started" | "asset_completed" | "asset_progress" | "cta_clicked";
  viewerId: string;
  activeIndex: number;
  metadata?: Record<string, unknown>;
};

async function trackJourneyEvent(payload: JourneyEventPayload) {
  const metadata = {
    ...(payload.metadata ?? {}),
    viewerId: payload.viewerId,
    activeIndex: payload.activeIndex,
    sendId: payload.journey.send_id ?? null,
    contactId: payload.journey.contact_id ?? null,
    shareToken: payload.journey.share_token ?? null,
    userAgent: window.navigator.userAgent.slice(0, 240)
  };

  await fetch("/api/journey-events", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      journeyId: payload.journey.id,
      assetId: payload.assetId,
      videoId: payload.videoId,
      eventType: payload.eventType,
      viewerId: payload.viewerId,
      activeIndex: payload.activeIndex,
      metadata
    })
  }).catch(() => undefined);
}
