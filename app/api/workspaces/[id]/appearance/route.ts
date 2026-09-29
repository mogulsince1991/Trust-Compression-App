import { NextResponse } from "next/server";
import { requireWorkspaceAccess, requireWorkspaceManager } from "@/lib/server/route-auth";
import { normalizeAppearance } from "@/lib/journey-appearance";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, params.id));
    const body = await request.json();
    const { error } = await context.serviceSupabase.from("workspaces").update({ journey_appearance: normalizeAppearance(body.appearance) }).eq("id", params.id);
    if (error) throw error;
    return NextResponse.json({ saved: true });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save appearance." }, { status });
  }
}
