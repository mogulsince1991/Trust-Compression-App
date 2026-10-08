"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function PdfReader({ url, title, assetId, token, onReady }: {
  url: string; title: string; assetId: string; token?: string | null; onReady: () => void;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    let disposed = false;
    let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined;
    const controller = new AbortController();
    setDocument(null); setPage(1); setError(""); setBusy(true);
    // Let this reader own loading and errors instead of the journey's play overlay.
    ready.current();
    void (async () => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      const headers: Record<string, string> = {};
      if (!token) {
        const session = await createBrowserSupabaseClient()?.auth.getSession();
        if (session?.data.session) headers.Authorization = `Bearer ${session.data.session.access_token}`;
      }
      const query = new URLSearchParams({ asset: assetId });
      if (token) query.set("token", token);
      let response = await fetch(`/api/media/pdf?${query}`, { headers, signal: controller.signal });
      // Sources outside the server allowlist can still permit browser CORS access.
      if (response.status === 422 || (!token && response.status === 404)) {
        response = await fetch(url, { signal: controller.signal, credentials: "omit" });
      }
      if (!response.ok) throw new Error("This PDF link is unavailable or has expired. Ask the sender to update the document link.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (disposed) return;
      task = pdfjs.getDocument({ data: bytes, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/", wasmUrl: "/pdfjs/wasm/" });
      const pdf = await task.promise;
      if (!disposed) setDocument(pdf);
    })().catch(reason => {
      if (!disposed) { setError(reason?.message || "Unable to load this PDF. Open the original below."); setBusy(false); }
    });
    return () => { disposed = true; controller.abort(); void task?.destroy(); };
  }, [url, assetId, token]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!document || !width || !canvas.current) return;
    let disposed = false;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    // A fresh canvas prevents canceled renders from competing for the same bitmap.
    const target = canvas.current;
    setBusy(true); setError("");
    void document.getPage(page).then(async pdfPage => {
      if (disposed) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.max(0.1, (width - 24) / base.width) * zoom;
      const view = pdfPage.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / (view.width * view.height)));
      target.width = Math.ceil(view.width * ratio); target.height = Math.ceil(view.height * ratio);
      target.style.width = `${view.width}px`; target.style.height = `${view.height}px`;
      render = pdfPage.render({ canvas: target, canvasContext: target.getContext("2d")!, viewport: view, transform: [ratio, 0, 0, ratio, 0, 0] });
      await render.promise;
      if (!disposed) { setBusy(false); viewport.current?.scrollTo(0, 0); }
    }).catch(reason => {
      if (!disposed && reason?.name !== "RenderingCancelledException") { setError("This page could not be displayed. Try another page or open the original."); setBusy(false); }
    });
    return () => { disposed = true; render?.cancel(); };
  }, [document, page, width, zoom]);

  return <section className="jx-pdf" aria-label={`${title} PDF reader`} onKeyDown={event => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.stopPropagation();
      if (document) { event.preventDefault(); setPage(value => Math.max(1, Math.min(document.numPages, value + (event.key === "ArrowRight" ? 1 : -1)))); }
    }
  }}>
    <nav className="jx-pdf-toolbar" aria-label="PDF pages">
      <button disabled={!document || page === 1} onClick={() => setPage(value => value - 1)}>Previous page</button>
      <span aria-live="polite">{document ? `Page ${page} of ${document.numPages}` : "PDF"}</span>
      <button disabled={!document || page === document.numPages} onClick={() => setPage(value => value + 1)}>Next page</button>
    </nav>
    <div className="jx-pdf-viewport" ref={viewport} tabIndex={0} aria-label="Document page" aria-busy={busy}>
      {busy && <p className="jx-pdf-status" role="status">Loading {document ? `page ${page}` : "document"}...</p>}
      {error && <p className="jx-pdf-status" role="alert">{error}</p>}
      <canvas key={`${page}-${width}-${zoom}`} ref={canvas} hidden={!document || !!error} role="img" aria-label={`${title}, page ${page}. Use Open original for accessible document text.`} />
    </div>
    <div className="jx-pdf-footer"><label>Zoom <select value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={1}>Fit width</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label><a href={url} target="_blank" rel="noreferrer">Open original PDF</a></div>
  </section>;
}
