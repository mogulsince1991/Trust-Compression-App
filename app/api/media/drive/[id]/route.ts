import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const driveIdPattern = /^[A-Za-z0-9_-]{10,200}$/;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const fileId = params.id?.trim();
  if (!fileId || !driveIdPattern.test(fileId)) {
    return NextResponse.json({ error: "Invalid Drive file." }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Google Drive streaming is not configured." }, { status: 503 });
  }

  const upstreamUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  upstreamUrl.searchParams.set("alt", "media");
  upstreamUrl.searchParams.set("key", apiKey);

  const range = request.headers.get("range");
  const upstream = await fetch(upstreamUrl, {
    headers: range ? { range } : undefined,
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: upstream.status === 404 ? "Drive video not found." : "Drive video could not be streamed." },
      { status: upstream.status === 403 || upstream.status === 404 ? upstream.status : 502 },
    );
  }

  const headers = new Headers();
  for (const name of ["accept-ranges", "content-length", "content-range", "content-type", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("cache-control", "private, max-age=300");
  headers.set("content-disposition", "inline");
  headers.set("x-content-type-options", "nosniff");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
