import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/server/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim() ?? "";
    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });

    const { serviceSupabase } = await requireWorkspaceAccess(request, workspaceId);
    const { error } = await serviceSupabase
      .from("social_profiles")
      .delete()
      .eq("id", params.id)
      .eq("workspace_id", workspaceId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove social profile." }, { status });
  }
}
