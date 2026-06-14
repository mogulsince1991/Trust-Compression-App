import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createUserSupabaseClient } from "@/lib/supabase";

type StartRequest = {
  workspaceId?: string;
  redirectTo?: string;
};

const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in before connecting Google Drive." }, { status: 401 });

    const clientId = getGoogleClientId();
    if (!clientId) return NextResponse.json({ error: "GOOGLE_CLIENT_ID is not configured in Vercel." }, { status: 500 });

    const body = (await request.json()) as StartRequest;
    const workspaceId = body.workspaceId?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const state = randomBytes(24).toString("hex");
    const { error } = await supabase.from("connector_oauth_states").insert({
      state,
      workspace_id: workspaceId,
      user_id: user.id,
      provider: "google_drive",
      redirect_to: body.redirectTo?.trim() || "/"
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const origin = new URL(request.url).origin;
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", `${origin}/api/connect/google-drive/callback`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", DRIVE_READONLY_SCOPE);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("state", state);

    return NextResponse.json({ authUrl: authUrl.toString(), scope: DRIVE_READONLY_SCOPE });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start Google Drive connection." }, { status: 400 });
  }
}

function getGoogleClientId() {
  return process.env.GOOGLE_CLIENT_ID?.trim() || process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
}
