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

  // Never ask Drive for the whole original. Bound open-ended browser ranges to 2 MiB.
  const requestedRange = request.headers.get("range");
  const match = requestedRange?.match(/^bytes=(\d+)-(\d*)$/);
  const suffix = requestedRange?.match(/^bytes=-(\d+)$/);
  if (requestedRange && !match && !suffix) return new Response(null, { status: 416 });
  const start = match ? Number(match[1]) : 0;
  const end = match?.[2] ? Number(match[2]) : start + 2097151;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return new Response(null, { status: 416 });
  const range = suffix ? `bytes=-${Math.min(Number(suffix[1]), 2097152)}` : `bytes=${start}-${Math.min(end, start + 2097151)}`;
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: { range },
      cache: "no-store",
      signal: request.signal,
    });
  } catch {
    return NextResponse.json({ error: "Drive stream is unavailable." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: upstream.status === 404 ? "Drive video not found." : "Drive video could not be streamed." },
      { status: upstream.status === 403 || upstream.status === 404 ? upstream.status : 502 },
    );
  }

  if (upstream.status !== 206 || !upstream.headers.get("content-range")) {
    await upstream.body.cancel();
    return NextResponse.json({ error: "Drive did not support partial playback for this file." }, { status: 502 });
  }

  const headers = new Headers();
  for (const name of ["accept-ranges", "content-length", "content-range", "content-type", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("cache-control", "private, max-age=300");
  headers.set("content-disposition", "inline");
  headers.set("x-content-type-options", "nosniff");
  headers.set("accept-ranges", "bytes");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
