import { NextResponse } from "next/server";

const keys = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_SCOPES",
  "GOOGLE_DRIVE_SCOPES",
  "GOOGLE_YOUTUBE_SCOPES",
  "GOOGLE_DRIVE_API_KEY",
  "YOUTUBE_API_KEY"
] as const;

export async function GET() {
  const configured = Object.fromEntries(keys.map((key) => [key, Boolean(process.env[key])])) as Record<(typeof keys)[number], boolean>;
  const scopes = [process.env.GOOGLE_SCOPES, process.env.GOOGLE_DRIVE_SCOPES, process.env.GOOGLE_YOUTUBE_SCOPES]
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean);

  return NextResponse.json({
    configured,
    hasDriveReadonlyScope: scopes.includes("https://www.googleapis.com/auth/drive.readonly"),
    hasYouTubeReadonlyScope: scopes.includes("https://www.googleapis.com/auth/youtube.readonly"),
    redirectUriMatchesDomain: process.env.GOOGLE_REDIRECT_URI === "https://trustcompression.unmarked.media/api/oauth/google/callback"
  });
}
