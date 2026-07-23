"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatJourneyAssetLabel, type JourneyAsset } from "@/components/trust-app-shared";

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

export function JourneyViewer({ journey, variant = "share" }: { journey: PublicJourney; variant?: "share" | "embed" }) {
  const [active, setActive] = useState(0);
  const [started, setStarted] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [driveStreamFailed, setDriveStreamFailed] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const activeAsset = journey.assets[active];
  const listRef = useRef<HTMLDivElement>(null);
  const trackedAssets = useRef<Set<string>>(new Set());
  const trackedOpen = useRef(false);
  const isYouTube = activeAsset?.embedUrl?.includes("youtube.com/embed");
  const orientation = activeAsset ? inferOrientation(activeAsset) : "wide";
  const driveFileId = activeAsset ? extractDriveFileId(activeAsset.sourceUrl ?? activeAsset.embedUrl) : null;
  const driveStreamUrl = driveFileId ? `/api/media/drive/${encodeURIComponent(driveFileId)}` : null;

  if (!activeAsset) return null;

  const embedUrl = useMemo(() => {
    if (!activeAsset?.embedUrl) return "";
    const url = new URL(activeAsset.embedUrl);
    if (isYouTube) {
      url.searchParams.set("enablejsapi", "1");
      url.searchParams.set("playsinline", "1");
      url.searchParams.set("vq", "hd1080");
      if (started) url.searchParams.set("autoplay", "1");
    }
    return url.toString();
  }, [activeAsset?.embedUrl, isYouTube, started]);

  useEffect(() => {
    setStarted(false);
    setShowOverlay(true);
    setDriveStreamFailed(false);
  }, [activeAsset?.id]);

  useEffect(() => {
    if (!showOverlay) return;
    const timer = window.setTimeout(() => setShowOverlay(false), started ? 2200 : 3600);
    return () => window.clearTimeout(timer);
  }, [activeAsset?.id, showOverlay, started]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const item = node.querySelector<HTMLElement>(`[data-index="${active}"]`);
    item?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [active]);

  useEffect(() => {
    if (trackedOpen.current) return;
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
  }, [active, journey, variant]);

  useEffect(() => {
    if (!activeAsset?.id) return;
    const key = `${journey.id}:${activeAsset.id}`;
    if (trackedAssets.current.has(key)) return;
    trackedAssets.current.add(key);

    void trackJourneyEvent({
      journey,
      assetId: activeAsset.id,
      videoId: activeAsset.videoId,
      eventType: "asset_started",
      viewerId: getViewerId(),
      activeIndex: active,
      metadata: { surface: variant }
    });
  }, [active, activeAsset?.id, journey, variant]);

  useEffect(() => {
    if (!started || !activeAsset?.id) return;
    let secondsWatched = 0;
    const duration = activeAsset.durationSeconds ?? null;
    const timer = window.setInterval(() => {
      secondsWatched += 10;
      const percentWatched = duration ? Math.min(100, Math.round((secondsWatched / duration) * 100)) : null;
      void trackJourneyEvent({
        journey,
        assetId: activeAsset.id,
        videoId: activeAsset.videoId,
        eventType: "asset_progress",
        viewerId: getViewerId(),
        activeIndex: active,
        metadata: {
          secondsWatched,
          durationSeconds: duration,
          percentWatched,
          source: "client_timer",
          surface: variant
        }
      });
    }, 10000);

    return () => window.clearInterval(timer);
  }, [active, activeAsset?.id, activeAsset?.durationSeconds, journey, started, variant]);

  useEffect(() => {
    if (!started || !activeAsset?.durationSeconds) return;
    const timer = window.setTimeout(() => next(), Math.max(8, activeAsset.durationSeconds) * 1000);
    return () => window.clearTimeout(timer);
  }, [active, activeAsset?.durationSeconds, started]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (["ArrowDown", "ArrowRight", "PageDown"].includes(event.key)) next();
      if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) previous();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [journey.assets.length]);

  function onWheel(event: React.WheelEvent<HTMLElement>) {
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const delta = horizontal ? event.deltaX : event.deltaY;
    if (Math.abs(delta) < 40) return;
    if (delta > 0) next();
    else previous();
  }

  function onTouchStart(event: React.TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: React.TouchEvent<HTMLElement>) {
    if (!touchStart.current) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStart.current.x;
    const deltaY = touch.clientY - touchStart.current.y;
    const landscape = window.matchMedia("(orientation: landscape)").matches;
    const delta = landscape ? deltaX : deltaY;
    if (Math.abs(delta) > 44) {
      if (delta < 0) next();
      else previous();
    }
    touchStart.current = null;
  }

  function next() {
    setActive((current) => Math.min(current + 1, journey.assets.length - 1));
  }

  function previous() {
    setActive((current) => Math.max(current - 1, 0));
  }

  function trackCtaClick() {
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

  function revealOverlay() {
    setShowOverlay(true);
  }

  return (
    <main className={`journey-viewer is-${orientation}${variant === "embed" ? " is-embed" : ""}`} onWheel={onWheel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <section className="journey-copy">
        <span>{variant === "embed" ? "Video journey" : "Private journey"}</span>
        <h1>{journey.heading || journey.title}</h1>
        {journey.description && <p>{journey.description}</p>}
      </section>

      <section className="reel-shell">
        <button className="reel-nav previous" onClick={previous} disabled={active === 0} aria-label="Previous asset">
          <ChevronLeft />
        </button>
        <article className={`reel-video${showOverlay ? " is-overlay-visible" : " is-overlay-hidden"}`} onClick={revealOverlay}>
          {driveStreamUrl && !driveStreamFailed ? (
            <video
              key={driveStreamUrl}
              src={driveStreamUrl}
              title={activeAsset.title}
              controls
              playsInline
              preload="auto"
              poster={activeAsset.thumbnailUrl ?? undefined}
              onPlay={() => setStarted(true)}
              onPause={() => setStarted(false)}
              onError={() => setDriveStreamFailed(true)}
            />
          ) : embedUrl ? (
            <iframe
              key={embedUrl}
              src={embedUrl}
              title={activeAsset.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              onLoad={() => setStarted(true)}
            />
          ) : (
            <div className="reel-poster" style={{ backgroundImage: `url(${activeAsset.thumbnailUrl ?? ""})` }} />
          )}
          <div className="reel-caption">
            <span>
              {active + 1} / {journey.assets.length}
            </span>
            <strong>{formatJourneyAssetLabel(activeAsset)}</strong>
          </div>
        </article>
        <button className="reel-nav next" onClick={next} disabled={active === journey.assets.length - 1} aria-label="Next asset">
          <ChevronRight />
        </button>
      </section>

      <section className="reel-queue" ref={listRef}>
        {journey.assets.map((asset, index) => (
          <button className={index === active ? "queue-card is-active" : "queue-card"} key={asset.id} data-index={index} onClick={() => setActive(index)}>
            <span style={{ backgroundImage: `url(${asset.thumbnailUrl ?? ""})` }} />
            <strong>{asset.title}</strong>
            <small>{formatJourneyAssetLabel(asset)}</small>
          </button>
        ))}
      </section>

      <button className="scroll-cue" onClick={next} disabled={active === journey.assets.length - 1} aria-label="Next asset">
        <ChevronDown />
      </button>

      {journey.cta_url && (
        <a className="share-cta floating" href={journey.cta_url} onClick={trackCtaClick} target={variant === "embed" ? "_blank" : undefined} rel={variant === "embed" ? "noreferrer" : undefined}>
          {journey.cta_label || "Continue"} <ArrowRight size={18} />
        </a>
      )}
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
    if (!url.hostname.includes("drive.google.com")) return null;
    const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    return fileMatch?.[1] ?? url.searchParams.get("id");
  } catch {
    return null;
  }
}

function getViewerId() {
  const key = "trust_viewer_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(key, next);
  return next;
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
  const supabase = createBrowserSupabaseClient();
  const metadata = {
    ...(payload.metadata ?? {}),
    viewerId: payload.viewerId,
    activeIndex: payload.activeIndex,
    sendId: payload.journey.send_id ?? null,
    contactId: payload.journey.contact_id ?? null,
    shareToken: payload.journey.share_token ?? null,
    userAgent: window.navigator.userAgent.slice(0, 240)
  };

  if (supabase) {
    const { error } = await supabase.from("journey_views").insert({
      journey_id: payload.journey.id,
      video_id: payload.videoId,
      asset_id: payload.assetId,
      event_type: payload.eventType,
      viewer_label: payload.viewerId.slice(0, 80),
      metadata
    });

    if (!error) return;
  }

  await fetch("/api/journey-events", {
    method: "POST",
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
