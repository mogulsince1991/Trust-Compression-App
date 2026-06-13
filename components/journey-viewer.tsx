"use client";

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
  title: string;
  heading: string | null;
  description: string | null;
  cta_label: string | null;
  cta_url: string | null;
  videos: JourneyVideo[];
};

export function JourneyViewer({ journey }: { journey: PublicJourney }) {
  const [active, setActive] = useState(0);
  const [started, setStarted] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const activeVideo = journey.videos[active];
  const listRef = useRef<HTMLDivElement>(null);
  const isYouTube = activeVideo?.embed_url?.includes("youtube.com/embed");

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
    const node = listRef.current;
    if (!node) return;
    const item = node.querySelector<HTMLElement>(`[data-index="${active}"]`);
    item?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [active]);

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

  return (
    <main className="journey-viewer" onWheel={onWheel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <section className="journey-copy">
        <span>Private journey</span>
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
        <a className="share-cta floating" href={journey.cta_url}>
          {journey.cta_label || "Continue"} <ArrowRight size={18} />
        </a>
      )}
    </main>
  );
}
