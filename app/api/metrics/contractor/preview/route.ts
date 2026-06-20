import { NextResponse } from "next/server";
import { fetchGoHighLevelPreview } from "@/lib/integrations/contractor/gohighlevel";
import { fetchJobTreadPreview } from "@/lib/integrations/contractor/jobtread";
import { getConnectedAccountForWorkspace } from "@/lib/server/connected-accounts";
import { requireWorkspaceAccess } from "@/lib/server/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PreviewRequest = {
  workspaceId?: string;
  connectedAccountId?: string;
  limit?: number;
  startDate?: string;
  endDate?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PreviewRequest;
    const workspaceId = String(body.workspaceId ?? "").trim();
    const connectedAccountId = String(body.connectedAccountId ?? "").trim();
    const limit = clampPositiveInteger(body.limit, 100);
    const startDate = String(body.startDate ?? "").trim();
    const endDate = String(body.endDate ?? "").trim();

    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });
    if (!connectedAccountId) return NextResponse.json({ error: "connectedAccountId is required." }, { status: 400 });

    const { serviceSupabase } = await requireWorkspaceAccess(request, workspaceId);
    const account = await getConnectedAccountForWorkspace(serviceSupabase, { workspaceId, connectedAccountId });

    if (!account) return NextResponse.json({ error: "Connected account was not found." }, { status: 404 });
    if (account.status !== "connected") {
      return NextResponse.json({ error: "Reconnect this account before previewing source rows." }, { status: 400 });
    }

    let preview;
    if (account.provider === "ghl" || account.provider === "gohighlevel") {
      preview = await fetchGoHighLevelPreview(account, { limit, startDate, endDate });
    } else if (account.provider === "jobtread") {
      preview = await fetchJobTreadPreview(account, { limit, startDate, endDate });
    } else {
      return NextResponse.json({ error: "Preview is not supported for this connected account provider." }, { status: 400 });
    }

    return NextResponse.json({
      connectedAccountId: account.id,
      accountLabel: account.account_label ?? null,
      provider: preview.provider,
      fetchedAt: new Date().toISOString(),
      ...preview,
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as any).status) : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not preview contractor source rows." },
      { status }
    );
  }
}

function clampPositiveInteger(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
