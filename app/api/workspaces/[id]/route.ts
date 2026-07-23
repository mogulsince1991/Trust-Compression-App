import { NextResponse } from "next/server";
import { requireWorkspaceAccess, requireWorkspaceManager } from "@/lib/server/route-auth";

type UpdateWorkspaceRequest = {
  name?: string;
};

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, params.id));
    const body = (await request.json()) as UpdateWorkspaceRequest;
    const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 80) {
      return NextResponse.json({ error: "Workspace name must be between 2 and 80 characters." }, { status: 400 });
    }

    const { data, error } = await context.serviceSupabase
      .from("workspaces")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .select("id,name,slug,settings,created_at,updated_at")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ workspace: { ...data, role: context.workspaceRole } });
  } catch (error) {
    return jsonError(error, "Could not update workspace.");
  }
}

function jsonError(error: unknown, fallback: string) {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : 400;
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status });
}

