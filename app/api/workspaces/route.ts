import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceSupabaseClient, createUserSupabaseClient } from "@/lib/supabase";

type CreateWorkspaceRequest = {
  name?: string;
};

export async function GET(request: Request) {
  try {
    const { user, serviceSupabase } = await requireSignedInUser(request);
    const { data: memberships, error } = await serviceSupabase
      .from("workspace_members")
      .select("role,created_at,workspaces(id,name,slug,settings,created_at,updated_at)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const workspaces = (memberships ?? [])
      .map((row: any) => {
        const workspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
        if (!workspace?.id) return null;
        return {
          id: String(workspace.id),
          name: String(workspace.name ?? "Workspace"),
          slug: String(workspace.slug ?? ""),
          role: String(row.role ?? "member"),
          settings: workspace.settings ?? {},
          created_at: workspace.created_at ?? null,
          updated_at: workspace.updated_at ?? null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ workspaces });
  } catch (error) {
    return jsonError(error, "Could not load workspaces.");
  }
}

export async function POST(request: Request) {
  try {
    const { user, serviceSupabase } = await requireSignedInUser(request);
    const body = (await request.json()) as CreateWorkspaceRequest;
    const name = cleanWorkspaceName(body.name);
    const slug = `${slugify(name)}-${randomUUID().replaceAll("-", "").slice(0, 10)}`;

    const { data: workspace, error: workspaceError } = await serviceSupabase
      .from("workspaces")
      .insert({ name, slug, created_by: user.id, updated_at: new Date().toISOString() })
      .select("id,name,slug,settings,created_at,updated_at")
      .single();

    if (workspaceError || !workspace) throw new Error(workspaceError?.message ?? "Could not create workspace.");

    const { error: memberError } = await serviceSupabase
      .from("workspace_members")
      .insert({ workspace_id: workspace.id, user_id: user.id, role: "owner", updated_at: new Date().toISOString() });

    if (memberError) {
      await serviceSupabase.from("workspaces").delete().eq("id", workspace.id).eq("created_by", user.id);
      throw new Error(memberError.message);
    }

    return NextResponse.json({
      workspace: {
        ...workspace,
        role: "owner",
      },
    });
  } catch (error) {
    return jsonError(error, "Could not create workspace.");
  }
}

async function requireSignedInUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw Object.assign(new Error("Sign in to manage workspaces."), { status: 401 });

  const userSupabase = createUserSupabaseClient(token);
  const {
    data: { user },
    error,
  } = await userSupabase.auth.getUser();

  if (error || !user) throw Object.assign(new Error("Your session expired. Sign in again."), { status: 401 });
  const serviceSupabase = createServiceSupabaseClient();
  if (!serviceSupabase) throw Object.assign(new Error("Workspace service is not configured."), { status: 500 });
  return { user, serviceSupabase };
}

function cleanWorkspaceName(value?: string) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) {
    throw Object.assign(new Error("Workspace name must be between 2 and 80 characters."), { status: 400 });
  }
  return name;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace";
}

function jsonError(error: unknown, fallback: string) {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : 400;
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status });
}
