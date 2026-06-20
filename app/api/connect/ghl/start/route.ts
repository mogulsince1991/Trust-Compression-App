import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/server/route-auth";

type StartRequest = {
  workspaceId?: string;
  redirectTo?: string;
};

const DEFAULT_GHL_AUTHORIZE_URL = "https://marketplace.leadconnectorhq.com/oauth/chooselocation";
const DEFAULT_GHL_SCOPE = "contacts.readonly";

export async function POST(request: Request) {
  try {
    const clientId = getGhlClientId();
    const clientSecret = process.env.GHL_CLIENT_SECRET?.trim();
    if (!clientId) return NextResponse.json({ error: "GHL_CLIENT_ID is not configured in Vercel." }, { status: 500 });
    if (!clientSecret) return NextResponse.json({ error: "GHL_CLIENT_SECRET is not configured in Vercel." }, { status: 500 });

    const body = (await request.json()) as StartRequest;
    const workspaceId = body.workspaceId?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const { user, serviceSupabase } = await requireWorkspaceAccess(request, workspaceId);

    const state = randomBytes(24).toString("hex");
    const { error } = await serviceSupabase.from("connector_oauth_states").insert({
      state,
      workspace_id: workspaceId,
      user_id: user.id,
      provider: "ghl",
      redirect_to: body.redirectTo?.trim() || "/contractor-metrics",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const origin = new URL(request.url).origin;
    const authUrl = new URL(process.env.GHL_OAUTH_AUTHORIZE_URL?.trim() || DEFAULT_GHL_AUTHORIZE_URL);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", `${origin}/api/connect/ghl/callback`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", process.env.GHL_OAUTH_SCOPE?.trim() || DEFAULT_GHL_SCOPE);
    authUrl.searchParams.set("state", state);

    return NextResponse.json({
      authUrl: authUrl.toString(),
      scope: process.env.GHL_OAUTH_SCOPE?.trim() || DEFAULT_GHL_SCOPE,
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as any).status) : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start GoHighLevel connection." },
      { status }
    );
  }
}

function getGhlClientId() {
  return process.env.GHL_CLIENT_ID?.trim() || process.env.NEXT_PUBLIC_GHL_CLIENT_ID?.trim();
}
