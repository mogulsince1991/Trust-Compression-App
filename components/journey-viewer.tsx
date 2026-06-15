"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type JourneyVideo = {
  id: string;
  title: string;
  summary: string | null;
  source_platform: string;
  source_url: string | null;
  embed_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
};

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
  videos: JourneyVideo[];
};

type VideoOrientation = "wide" | "portrait";

export function JourneyViewer({ journey, variant = "share" }: { journey: PublicJourney; variant?: "share" | "embed" }) {
  const [active, setActive] = useState(0);
  const [started, setStarted] = useState(false);
  const [orientationByVideo, setOrientationByVideo] = useState<Record<string, VideoOrientation>>({});
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const activeVideo = journey.videos[active];
  const listRef = useRef<HTMLDivElement>(null);
  const trackedVideos = useRef<Set<string>>(new Set());
  const trackedOpen = useRef(false);
  const isYouTube = activeVideo?.embed_url?.includes("youtube.com/embed");
  const orientation = activeVideo ? orientationByVideo[activeVideo.id] ?? inferOrientation(activeVideo) : "wide";

  const embedUrl = useMemo(() => {
    if (!activeVideo?.embed_url) return "";
    const url = new URL(activeVideo.embed_url);
    if (isYouTube) {
      url.searchParams.set("enablejsapi", "1");
      url.searchParams.set("playsinline", "1");
      if (started) url.searchParams.set("autoplay", "1");
    }
    return url.toString();
  }, [activeVideo?.embed_url, isYouTube, started]);

  useEffect(() => {
    setStarted(false);
  }, [activeVideo?.id]);

  useEffect(() => {
    if (!activeVideo?.thumbnail_url || orientationByVideo[activeVideo.id]) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled || !image.naturalWidth || !image.naturalHeight) return;
      const nextOrientation: VideoOrientation = image.naturalHeight > image.naturalWidth * 1.12 ? "portrait" : "wide";
      setOrientationByVideo((current) => ({ ...current, [activeVideo.id]: nextOrientation }));
    };
    image.onerror = () => {
      if (cancelled) return;
      setOrientationByVideo((current) => ({ ...current, [activeVideo.id]: inferOrientation(activeVideo) }));
    };
    image.src = activeVideo.thumbnail_url;
    return () => {
      cancelled = true;
    };
  }, [activeVideo, orientationByVideo]);

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
      videoId: null,
      eventType: "opened",
      viewerId: getViewerId(),
      activeIndex: active,
      metadata: { surface: variant }
    });
  }, [active, journey, variant]);

  useEffect(() => {
    if (!activeVideo?.id) return;
    const key = `${journey.id}:${activeVideo.id}`;
    if (trackedVideos.current.has(key)) return;
    trackedVideos.current.add(key);

    void trackJourneyEvent({
      journey,
      videoId: activeVideo.id,
      eventType: "video_started",
      viewerId: getViewerId(),
      activeIndex: active,
      metadata: { surface: variant }
    });
  }, [active, activeVideo?.id, journey, variant]);

  useEffect(() => {
    if (!started || !activeVideo?.id) return;
    let secondsWatched = 0;
    const duration = activeVideo.duration_seconds ?? null;
    const timer = window.setInterval(() => {
      secondsWatched += 10;
      const percentWatched = duration ? Math.min(100, Math.round((secondsWatched / duration) * 100)) : null;
      void trackJourneyEvent({
        journey,
        videoId: activeVideo.id,
        eventType: "video_progress",
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
  }, [active, activeVideo?.id, activeVideo?.duration_seconds, journey, started, variant]);

  useEffect(() => {
    if (!started || !activeVideo?.duration_seconds) return;
    const timer = window.setTimeout(() => next(), Math.max(8, activeVideo.duration_seconds) * 1000);
    return () => window.clearTimeout(timer);
  }, [active, activeVideo?.duration_seconds, started]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (["ArrowDown", "ArrowRight", "PageDown"].includes(event.key)) next();
      if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) previous();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [journey.videos.length]);

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
    setActive((current) => Math.min(current + 1, journey.videos.length - 1));
  }

  function previous() {
    setActive((current) => Math.max(current - 1, 0));
  }

  function trackCtaClick() {
    void trackJourneyEvent({
      journey,
      videoId: activeVideo?.id ?? null,
      eventType: "cta_clicked",
      viewerId: getViewerId(),
      activeIndex: active,
      metadata: { surface: variant }
    });
  }

  return (
    <main className={`journey-viewer is-${orientation}${variant === "embed" ? " is-embed" : ""}`} onWheel={onWheel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <section className="journey-copy">
        <span>{variant === "embed" ? "Video journey" : "Private journey"}</span>
        <h1>{journey.heading || journey.title}</h1>
        {journey.description && <p>{journey.description}</p>}
      </section>

      <section className="reel-shell">
        <button className="reel-nav previous" onClick={previous} disabled={active === 0} aria-label="Previous video">
          <ChevronLeft />
        </button>
        <article className="reel-video">
          {embedUrl ? (
            <iframe
              key={embedUrl}
              src={embedUrl}
              title={activeVideo.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              onLoad={() => setStarted(true)}
            />
          ) : (
            <div className="reel-poster" style={{ backgroundImage: `url(${activeVideo.thumbnail_url ?? ""})` }} />
          )}
          <div className="reel-caption">
            <span>
              {active + 1} / {journey.videos.length}
            </span>
          </div>
        </article>
        <button className="reel-nav next" onClick={next} disabled={active === journey.videos.length - 1} aria-label="Next video">
          <ChevronRight />
        </button>
      </section>

      <section className="reel-queue" ref={listRef}>
        {journey.videos.map((video, index) => (
          <button className={index === active ? "queue-card is-active" : "queue-card"} key={video.id} data-index={index} onClick={() => setActive(index)}>
            <span style={{ backgroundImage: `url(${video.thumbnail_url ?? ""})` }} />
            <strong>{video.title}</strong>
          </button>
        ))}
      </section>

      <button className="scroll-cue" onClick={next} disabled={active === journey.videos.length - 1} aria-label="Next video">
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

function inferOrientation(video: JourneyVideo): VideoOrientation {
  const source = `${video.source_url ?? ""} ${video.embed_url ?? ""} ${video.title ?? ""}`.toLowerCase();
  if (source.includes("/shorts/") || source.includes("reel") || source.includes("vertical") || source.includes("portrait")) return "portrait";
  return "wide";
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
  videoId: string | null;
  eventType: "opened" | "video_started" | "video_completed" | "video_progress" | "cta_clicked";
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
      videoId: payload.videoId,
      eventType: payload.eventType,
      viewerId: payload.viewerId,
      activeIndex: payload.activeIndex,
      metadata
    })
  }).catch(() => undefined);
}
