import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleProfile = {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return redirectWithMessage(url, `/sources?connect_error=${encodeURIComponent(error)}`);
  if (!code || !state) return redirectWithMessage(url, "/sources?connect_error=missing_google_oauth_code");

  const supabase = createServiceSupabaseClient();
  if (!supabase) return redirectWithMessage(url, "/sources?connect_error=supabase_service_role_missing");

  const { data: oauthState, error: stateError } = await supabase
    .from("connector_oauth_states")
    .select("id,state,workspace_id,user_id,provider,redirect_to,expires_at")
    .eq("state", state)
    .eq("provider", "google_drive")
    .maybeSingle();

  if (stateError || !oauthState) return redirectWithMessage(url, "/sources?connect_error=invalid_oauth_state");
  if (new Date(oauthState.expires_at).getTime() < Date.now()) return redirectWithMessage(url, "/sources?connect_error=expired_oauth_state");

  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  if (!clientId || !clientSecret) return redirectWithMessage(url, "/sources?connect_error=google_oauth_env_missing");

  const origin = url.origin;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${origin}/api/connect/google-drive/callback`
    })
  });
  const tokenData = (await tokenResponse.json()) as TokenResponse;

  if (!tokenResponse.ok || !tokenData.access_token) {
    const message = tokenData.error_description || tokenData.error || "google_token_exchange_failed";
    return redirectWithMessage(url, `/sources?connect_error=${encodeURIComponent(message)}`);
  }

  const profile = await fetchGoogleProfile(tokenData.access_token);
  const externalId = profile.sub || profile.email || oauthState.user_id;
  const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null;

  const { error: upsertError } = await supabase.from("connected_accounts").upsert(
    {
      workspace_id: oauthState.workspace_id,
      user_id: oauthState.user_id,
      provider: "google_drive",
      external_account_id: externalId,
      account_label: profile.email || profile.name || "Google Drive",
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? null,
      token_type: tokenData.token_type ?? "Bearer",
      scope: tokenData.scope ?? "https://www.googleapis.com/auth/drive.readonly",
      expires_at: expiresAt,
      status: "connected",
      metadata: {
        email: profile.email ?? null,
        name: profile.name ?? null,
        picture: profile.picture ?? null,
        readonly: true
      },
      updated_at: new Date().toISOString()
    },
    { onConflict: "workspace_id,provider,external_account_id" }
  );

  await supabase.from("connector_oauth_states").delete().eq("id", oauthState.id);

  if (upsertError) return redirectWithMessage(url, `/sources?connect_error=${encodeURIComponent(upsertError.message)}`);
  return redirectWithMessage(url, `${oauthState.redirect_to || "/"}?connect_success=google_drive`);
}

async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return {};
  return (await response.json()) as GoogleProfile;
}

function redirectWithMessage(currentUrl: URL, path: string) {
  return NextResponse.redirect(new URL(path, currentUrl.origin));
}

function getGoogleClientId() {
  return process.env.GOOGLE_CLIENT_ID?.trim() || process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
}

function getGoogleClientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
}
