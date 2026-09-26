"use client";
import { useEffect, useRef } from "react";
import { PlaybackClock } from "@/lib/playback-clock";

type Player = { on: (name: string, callback: (data: any) => void) => void; destroy: () => Promise<void> };
type VimeoApi = { Player: new (frame: HTMLIFrameElement) => Player };
let sdk: Promise<VimeoApi> | null = null;
function load() {
  const global = window as typeof window & { Vimeo?: VimeoApi };
  if (global.Vimeo) return Promise.resolve(global.Vimeo);
  if (!sdk) sdk = new Promise<VimeoApi>((resolve, reject) => {
    const script = document.createElement("script"); script.src = "https://player.vimeo.com/api/player.js"; script.async = true;
    script.onload = () => global.Vimeo ? resolve(global.Vimeo) : reject(Error("Vimeo unavailable"));
    script.onerror = () => { script.remove(); reject(Error("Vimeo unavailable")); };
    document.head.appendChild(script);
  }).catch(error => { sdk = null; throw error; });
  return sdk;
}

export function VimeoPlayer({ url, title, onLoaded, onEvent }: { url: string; title: string; onLoaded: () => void; onEvent: (type: "asset_started" | "asset_progress" | "asset_completed", metadata: Record<string, unknown>) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const eventRef = useRef(onEvent); eventRef.current = onEvent;
  useEffect(() => {
    let disposed = false; let player: Player | undefined; let playing = false; let rate = 1; let reported = 0;
    const clock = new PlaybackClock(); const session = crypto.randomUUID();
    function emit(type: "asset_started" | "asset_progress" | "asset_completed") { eventRef.current(type, { ...clock.snapshot(), source: "vimeo_player", playbackSessionId: session }); }
    function flush() { if (clock.secondsWatched > reported) { emit("asset_progress"); reported = clock.secondsWatched; } clock.resetSample(); }
    void load().then(api => {
      if (disposed || !frame.current) return;
      player = new api.Player(frame.current);
      player.on("playing", () => { playing = true; clock.resetSample(); });
      player.on("pause", () => { playing = false; flush(); });
      for (const event of ["bufferstart", "seeking", "seeked"]) player.on(event, flush);
      player.on("bufferend", () => { clock.resetSample(); });
      player.on("play", () => { playing = true; clock.resetSample(); });
      player.on("seeked", () => { clock.resetSample(); });
      player.on("playbackratechange", data => { rate = data.playbackRate || 1; clock.resetSample(); });
      player.on("timeupdate", data => {
        if (disposed) return;
        const started = clock.started;
        clock.sample({ position: data.seconds, duration: data.duration, playing, rate, visible: document.visibilityState === "visible", now: performance.now() });
        if (!started && clock.started) emit("asset_started");
        if (clock.secondsWatched - reported >= 10) { emit("asset_progress"); reported = clock.secondsWatched; }
      });
      player.on("ended", () => { flush(); playing = false; if (clock.started && !clock.completed) { clock.completed = true; emit("asset_completed"); } });
    }).catch(() => { /* The official iframe still plays without analytics when its SDK is blocked. */ });
    document.addEventListener("visibilitychange", flush); window.addEventListener("pagehide", flush);
    return () => { flush(); disposed = true; document.removeEventListener("visibilitychange", flush); window.removeEventListener("pagehide", flush); void player?.destroy().catch(() => undefined); };
  }, [url]);
  return <iframe ref={frame} src={url} title={title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen onLoad={onLoaded} />;
}
