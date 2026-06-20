import { NextResponse } from "next/server";
import { getContractorRuleSet, saveContractorRuleSet } from "@/lib/server/contractor-rule-sets";
import { requireWorkspaceAccess } from "@/lib/server/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim();
    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });

    const { serviceSupabase } = await requireWorkspaceAccess(request, workspaceId);
    const ruleSet = await getContractorRuleSet(serviceSupabase, workspaceId, id);
    return NextResponse.json({ ruleSet });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as any).status) : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load contractor rule set." }, { status });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const workspaceId = String(body.workspaceId ?? "").trim();
    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });

    const { serviceSupabase, user } = await requireWorkspaceAccess(request, workspaceId);
    const ruleSet = await saveContractorRuleSet(serviceSupabase, workspaceId, body.ruleSet ?? body, user.id, id);
    return NextResponse.json({ ruleSet });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as any).status) : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update contractor rule set." }, { status });
  }
}
