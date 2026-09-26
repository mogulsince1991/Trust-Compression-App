import { NextResponse } from "next/server";
import { normalizeJourneyEmbed } from "@/lib/journey-embeds";

export async function GET(request: Request) {
  try {
    const asset = normalizeJourneyEmbed({ url: new URL(request.url).searchParams.get("url") || "" });
    const provider = asset.sourcePlatform;
    if (!["vimeo", "loom"].includes(provider)) return new Response(null, { status: 400 });
    const endpoint = provider === "vimeo" ? "https://vimeo.com/api/oembed.json" : "https://www.loom.com/v1/oembed";
    const metadata = await fetch(`${endpoint}?url=${encodeURIComponent(asset.sourceUrl)}`, { redirect: "error", next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) });
    if (!metadata.ok) return new Response(null, { status: 404 });
    const data = await metadata.json();
    const image = new URL(data.thumbnail_url);
    const allowed = provider === "vimeo" ? ["vimeocdn.com"] : ["loom.com", "useloom.com"];
    if (image.protocol !== "https:" || !allowed.some(host => image.hostname === host || image.hostname.endsWith(`.${host}`))) return new Response(null, { status: 404 });
    const response = await fetch(image, { redirect: "error", next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) });
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !/^image\/(jpeg|png|webp)/.test(type)) return new Response(null, { status: 404 });
    return new Response(response.body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "Preview unavailable" }, { status: 404 }); }
}
