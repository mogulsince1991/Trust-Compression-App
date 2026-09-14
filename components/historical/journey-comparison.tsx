"use client";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { JourneyViewer, type PublicJourney } from "./june-13-viewer";
import { historicalStyles } from "./june-13-styles";

const documentHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>June 13 journey comparison</title><style>${historicalStyles}</style></head><body><div id="historical-root"></div></body></html>`;

export function HistoricalJourneyComparison({ journey }: { journey: PublicJourney }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return <>
    <iframe ref={frame} title="Historical June 13 journey player" srcDoc={documentHtml} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0, zIndex: 9999, background: "black" }} onLoad={() => setTarget(frame.current?.contentDocument?.getElementById("historical-root") ?? null)} />
    {target && frame.current?.contentWindow && createPortal(<JourneyViewer journey={journey} frameWindow={frame.current.contentWindow} />, target)}
  </>;
}
