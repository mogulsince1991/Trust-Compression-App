import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/server/route-auth";
import { recordActivity } from "@/lib/server/activity";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const workspaceId = String(body.workspaceId ?? "").trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const context = await requireWorkspaceAccess(request, workspaceId);
    await recordActivity(context.serviceSupabase, {
      workspaceId,
      actorUserId: context.user.id,
      eventType: "workspace_active",
      entityType: "workspace",
      entityId: workspaceId,
      surface: String(body.surface ?? "app").slice(0, 80),
    });
    return NextResponse.json({ recorded: true });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Activity could not be recorded." }, { status });
  }
}

