import { NextResponse } from "next/server";
import { requireWorkspaceAccess, requireWorkspaceManager, workspaceManagerRoles } from "@/lib/server/route-auth";

const assignableRoles = new Set(["admin", "member", "sales_rep", "library_manager", "viewer"]);

type MemberMutationRequest = {
  membershipId?: string;
  role?: string;
};

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await requireWorkspaceAccess(request, params.id);
    let query = context.serviceSupabase
      .from("workspace_members")
      .select("id,user_id,role,created_at,updated_at")
      .eq("workspace_id", params.id)
      .order("created_at", { ascending: true });

    if (!workspaceManagerRoles.has(context.workspaceRole)) {
      query = query.eq("user_id", context.user.id);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const members = await Promise.all(
      (data ?? []).map(async (membership) => {
        const { data: authUser } = await context.serviceSupabase.auth.admin.getUserById(membership.user_id);
        const email = authUser.user?.email ?? "Unknown user";
        const metadata = authUser.user?.user_metadata ?? {};
        return {
          id: membership.id,
          userId: membership.user_id,
          email,
          displayName: String(metadata.full_name ?? metadata.name ?? email.split("@")[0] ?? "Member"),
          role: membership.role,
          createdAt: membership.created_at,
          updatedAt: membership.updated_at,
        };
      })
    );

    return NextResponse.json({ members, canManage: workspaceManagerRoles.has(context.workspaceRole) });
  } catch (error) {
    return jsonError(error, "Could not load workspace members.");
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, params.id));
    const body = (await request.json()) as MemberMutationRequest;
    const membershipId = String(body.membershipId ?? "").trim();
    const role = String(body.role ?? "").trim();
    if (!membershipId || !assignableRoles.has(role)) {
      return NextResponse.json({ error: "Choose a valid member and role." }, { status: 400 });
    }

    const { data: existing, error: existingError } = await context.serviceSupabase
      .from("workspace_members")
      .select("id,user_id,role")
      .eq("id", membershipId)
      .eq("workspace_id", params.id)
      .single();

    if (existingError || !existing) throw Object.assign(new Error("Workspace member was not found."), { status: 404 });
    if (existing.role === "owner") throw Object.assign(new Error("The workspace owner role cannot be changed here."), { status: 400 });

    const { data, error } = await context.serviceSupabase
      .from("workspace_members")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", membershipId)
      .eq("workspace_id", params.id)
      .select("id,user_id,role,created_at,updated_at")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ member: data });
  } catch (error) {
    return jsonError(error, "Could not update workspace member.");
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, params.id));
    const body = (await request.json()) as MemberMutationRequest;
    const membershipId = String(body.membershipId ?? "").trim();
    if (!membershipId) return NextResponse.json({ error: "Member is required." }, { status: 400 });

    const { data: existing, error: existingError } = await context.serviceSupabase
      .from("workspace_members")
      .select("id,user_id,role")
      .eq("id", membershipId)
      .eq("workspace_id", params.id)
      .single();

    if (existingError || !existing) throw Object.assign(new Error("Workspace member was not found."), { status: 404 });
    if (existing.role === "owner") throw Object.assign(new Error("The workspace owner cannot be removed."), { status: 400 });
    if (existing.user_id === context.user.id) throw Object.assign(new Error("Use another workspace owner to remove your own access."), { status: 400 });

    const { error } = await context.serviceSupabase
      .from("workspace_members")
      .delete()
      .eq("id", membershipId)
      .eq("workspace_id", params.id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, "Could not remove workspace member.");
  }
}

function jsonError(error: unknown, fallback: string) {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : 400;
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status });
}
