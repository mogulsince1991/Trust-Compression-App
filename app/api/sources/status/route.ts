import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const youtubeApiKey = getFirstEnv("YOUTUBE_API_KEY", "GOOGLE_YOUTUBE_API_KEY");
  const driveApiKey = getFirstEnv("GOOGLE_DRIVE_API_KEY", "GOOGLE_API_KEY");
  const googleOAuthClient = getFirstEnv("GOOGLE_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_AUTH_CLIENT_ID");
  const googleOAuthSecret = getFirstEnv("GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_AUTH_CLIENT_SECRET");

  return NextResponse.json(
    {
      youtube: {
        publicVideoImport: true,
        publicChannelRssImport: true,
        fullApiImport: Boolean(youtubeApiKey),
        expectedEnv: youtubeApiKey ? null : "YOUTUBE_API_KEY"
      },
      googleDrive: {
        publicFileImport: true,
        publicFolderImport: Boolean(driveApiKey),
        privateOAuthConfigured: Boolean(googleOAuthClient && googleOAuthSecret),
        expectedEnv: driveApiKey ? null : "GOOGLE_DRIVE_API_KEY or GOOGLE_API_KEY"
      },
      googleOAuth: {
        configured: Boolean(googleOAuthClient && googleOAuthSecret),
        expectedEnv: googleOAuthClient && googleOAuthSecret ? null : "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"
      },
      checkedAt: new Date().toISOString()
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    }
  );
}

function getFirstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}
