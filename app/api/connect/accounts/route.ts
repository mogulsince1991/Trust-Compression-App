import { NextResponse } from "next/server";
import { listConnectedAccountsForWorkspace } from "@/lib/server/connected-accounts";
import { requireWorkspaceAccess } from "@/lib/server/route-auth";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const { serviceSupabase } = await requireWorkspaceAccess(request, workspaceId);
    const accounts = await listConnectedAccountsForWorkspace(serviceSupabase, workspaceId);
    return NextResponse.json({ accounts });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as any).status) : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load connected accounts." }, { status });
  }
}
