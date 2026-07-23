import { NextResponse } from "next/server";
import { requireWorkspaceAccess, requireWorkspaceManager } from "@/lib/server/route-auth";

type InviteRequest = {
  workspaceId?: string;
  inviteId?: string;
  email?: string;
  role?: string;
};

const allowedRoles = new Set(["admin", "member", "sales_rep", "library_manager", "viewer"]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, workspaceId));
    const { data, error } = await context.serviceSupabase
      .from("workspace_invites")
      .select("id,email,role,status,token,expires_at,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    return NextResponse.json({
      invites: (data ?? []).map((invite) => ({
        ...invite,
        inviteUrl: `${url.origin}/invite/${invite.token}`,
      })),
    });
  } catch (error) {
    return jsonError(error, "Could not load invites.");
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as InviteRequest;
    const workspaceId = body.workspaceId?.trim();
    const email = body.email?.trim().toLowerCase();
    const role = allowedRoles.has(body.role ?? "") ? body.role! : "member";
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });
    if (!email || !email.includes("@")) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });

    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, workspaceId));
    if (context.user.email?.toLowerCase() === email) {
      return NextResponse.json({ error: "You already belong to this workspace." }, { status: 400 });
    }

    const now = new Date();
    const { data, error } = await context.serviceSupabase
      .from("workspace_invites")
      .upsert(
        {
          workspace_id: workspaceId,
          email,
          role,
          status: "pending",
          invited_by: context.user.id,
          expires_at: new Date(now.getTime() + 14 * 86400000).toISOString(),
          updated_at: now.toISOString(),
        },
        { onConflict: "workspace_id,email,status" }
      )
      .select("id,email,role,status,token,expires_at,created_at")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({
      invite: {
        ...data,
        inviteUrl: `${new URL(request.url).origin}/invite/${data.token}`,
      },
    });
  } catch (error) {
    return jsonError(error, "Could not create invite.");
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as InviteRequest;
    const workspaceId = body.workspaceId?.trim();
    const inviteId = body.inviteId?.trim();
    if (!workspaceId || !inviteId) return NextResponse.json({ error: "Workspace and invite are required." }, { status: 400 });

    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, workspaceId));
    const { error } = await context.serviceSupabase
      .from("workspace_invites")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("id", inviteId)
      .eq("workspace_id", workspaceId)
      .eq("status", "pending");

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, "Could not revoke invite.");
  }
}

function jsonError(error: unknown, fallback: string) {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : 400;
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status });
}
