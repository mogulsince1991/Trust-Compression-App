import { NextResponse } from "next/server";
import { httpError, requireWorkspaceAccess } from "@/lib/server/route-auth";

type RouteContext = {
  params: { id: string };
};

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim();
    if (!workspaceId) throw httpError(400, "Workspace is required.");

    const { serviceSupabase } = await requireWorkspaceAccess(request, workspaceId);
    const { error } = await serviceSupabase
      .from("library_assets")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("workspace_id", workspaceId);

    if (error) throw httpError(500, error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof (error as any).status === "number" ? (error as any).status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not archive library asset." }, { status });
  }
}
