import { NextResponse } from "next/server";

const DEFAULT_GHL_AUTHORIZE_URL = "https://marketplace.leadconnectorhq.com/oauth/chooselocation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = process.env.GHL_CLIENT_ID?.trim() || process.env.NEXT_PUBLIC_GHL_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GHL_CLIENT_SECRET?.trim() || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  return NextResponse.json({
    oauthConfigured: Boolean(clientId && clientSecret),
    serviceRoleConfigured: Boolean(serviceRoleKey),
    privateIntegrationSupported: true,
    callbackUrl: `${url.origin}/api/connect/ghl/callback`,
    authorizeUrl: process.env.GHL_OAUTH_AUTHORIZE_URL?.trim() || DEFAULT_GHL_AUTHORIZE_URL,
  });
}
