import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";

type AcceptRequest = {
  token?: string;
};

export async function POST(request: Request) {
  try {
    const authToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!authToken) return NextResponse.json({ error: "Sign in to accept this invite." }, { status: 401 });

    const body = (await request.json()) as AcceptRequest;
    const inviteToken = body.token?.trim();
    if (!inviteToken) return NextResponse.json({ error: "Invite token is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(authToken);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const { data, error } = await supabase.rpc("accept_workspace_invite", { invite_token: inviteToken });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ workspaceId: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not accept invite." }, { status: 400 });
  }
}
