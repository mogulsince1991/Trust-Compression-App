import { NextResponse } from "next/server";

// API-key access only: never expose files accessible solely through a user's OAuth grant.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(params.id)) return NextResponse.json({ error: "Invalid Drive file." }, { status: 400 });
  const key = process.env.GOOGLE_DRIVE_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: "Drive preview metadata is not configured." }, { status: 503 });
  try {
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${params.id}`);
    url.searchParams.set("key", key);
    url.searchParams.set("fields", "name,thumbnailLink,videoMediaMetadata");
    const response = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return NextResponse.json({ error: "Public Drive preview is unavailable." }, { status: 404 });
    const file = await response.json();
    if (new URL(request.url).searchParams.get("image") !== "1") {
      return NextResponse.json({ title: file.name || null, thumbnailUrl: file.thumbnailLink ? `/api/media/drive/${params.id}/preview?image=1` : null }, { headers: { "Cache-Control": "public, max-age=300" } });
    }
    const thumbnail = new URL(file.thumbnailLink || "https://invalid.invalid");
    if (thumbnail.protocol !== "https:" || !["googleusercontent.com", "google.com"].some(host => thumbnail.hostname === host || thumbnail.hostname.endsWith(`.${host}`))) {
      return new Response(null, { status: 404 });
    }
    const image = await fetch(thumbnail, { redirect: "error", next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) });
    const type = image.headers.get("content-type")?.split(";")[0] ?? "";
    if (!image.ok || !["image/jpeg", "image/png", "image/webp"].includes(type)) return new Response(null, { status: 404 });
    return new Response(image.body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "Drive preview is temporarily unavailable." }, { status: 502 });
  }
}
