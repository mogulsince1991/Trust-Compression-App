import { NextResponse } from "next/server";
import { contractorMetricBuilderPayload, ensureDefaultContractorRuleSet, listContractorRuleSets, saveContractorRuleSet } from "@/lib/server/contractor-rule-sets";
import { requireWorkspaceAccess } from "@/lib/server/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim();
    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });

    const { serviceSupabase, user } = await requireWorkspaceAccess(request, workspaceId);
    const defaultRuleSet = await ensureDefaultContractorRuleSet(serviceSupabase, workspaceId, user.id);
    const ruleSets = await listContractorRuleSets(serviceSupabase, workspaceId);
    return NextResponse.json(contractorMetricBuilderPayload(ruleSets, defaultRuleSet));
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as any).status) : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load contractor config." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const workspaceId = String(body.workspaceId ?? "").trim();
    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });

    const { serviceSupabase, user } = await requireWorkspaceAccess(request, workspaceId);
    const saved = await saveContractorRuleSet(serviceSupabase, workspaceId, body.ruleSet ?? body, user.id);
    return NextResponse.json({ ruleSet: saved });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as any).status) : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save contractor config." }, { status });
  }
}
