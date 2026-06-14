import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";

type InviteRequest = {
  workspaceId?: string;
  email?: string;
  role?: string;
};

const allowedRoles = new Set(["owner", "admin", "member", "sales_rep", "library_manager", "viewer"]);

export async function GET(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in to load invites." }, { status: 401 });

    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const { data, error } = await supabase
      .from("workspace_invites")
      .select("id,email,role,status,token,expires_at,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const origin = url.origin;
    return NextResponse.json({
      invites: (data ?? []).map((invite) => ({
        ...invite,
        inviteUrl: `${origin}/invite/${invite.token}`
      }))
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load invites." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in to invite teammates." }, { status: 401 });

    const body = (await request.json()) as InviteRequest;
    const workspaceId = body.workspaceId?.trim();
    const email = body.email?.trim().toLowerCase();
    const role = allowedRoles.has(body.role ?? "") ? body.role! : "member";

    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });
    if (!email || !email.includes("@")) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const { data, error } = await supabase
      .from("workspace_invites")
      .upsert(
        {
          workspace_id: workspaceId,
          email,
          role,
          status: "pending",
          invited_by: user.id,
          expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
          updated_at: new Date().toISOString()
        },
        { onConflict: "workspace_id,email,status" }
      )
      .select("id,email,role,status,token,expires_at,created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const origin = new URL(request.url).origin;
    return NextResponse.json({ invite: { ...data, inviteUrl: `${origin}/invite/${data.token}` } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create invite." }, { status: 400 });
  }
}
