import { NextResponse } from "next/server";
import { fetchGoHighLevelSnapshot } from "@/lib/integrations/contractor/gohighlevel";
import { fetchJobTreadSnapshot } from "@/lib/integrations/contractor/jobtread";
import { ingestContractorSnapshot } from "@/lib/metrics/contractor/ingest";
import { getConnectedAccountForWorkspace } from "@/lib/server/connected-accounts";
import { requireWorkspaceAccess } from "@/lib/server/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SyncRequest = {
  workspaceId?: string;
  connectedAccountId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SyncRequest;
    const workspaceId = String(body.workspaceId ?? "").trim();
    const connectedAccountId = String(body.connectedAccountId ?? "").trim();

    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });
    if (!connectedAccountId) return NextResponse.json({ error: "connectedAccountId is required." }, { status: 400 });

    const { user, serviceSupabase } = await requireWorkspaceAccess(request, workspaceId);
    const account = await getConnectedAccountForWorkspace(serviceSupabase, { workspaceId, connectedAccountId });

    if (!account) return NextResponse.json({ error: "Connected account was not found." }, { status: 404 });
    if (account.status !== "connected") {
      return NextResponse.json({ error: "Reconnect this account before syncing." }, { status: 400 });
    }

    let snapshot;
    let provider;

    if (account.provider === "ghl") {
      provider = "gohighlevel";
      snapshot = await fetchGoHighLevelSnapshot(account);
    } else if (account.provider === "jobtread") {
      provider = "jobtread";
      snapshot = await fetchJobTreadSnapshot(account);
    } else {
      return NextResponse.json({ error: "Unsupported connected account provider." }, { status: 400 });
    }

    const result = await ingestContractorSnapshot(serviceSupabase, {
      workspaceId,
      provider,
      displayName: snapshot.displayName,
      externalAccountId: snapshot.externalAccountId,
      connectedAccountId: account.id,
      createdBy: user.id,
      settings: snapshot.settings,
      leads: snapshot.leads,
      jobs: snapshot.jobs,
      spendRows: snapshot.spendRows,
    });

    await serviceSupabase
      .from("connected_accounts")
      .update({
        status: "connected",
        metadata: {
          ...(account.metadata ?? {}),
          lastSyncSummary: {
            syncedAt: new Date().toISOString(),
            imported: result.imported,
            updated: result.updated,
            skipped: result.skipped,
            provider,
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);

    return NextResponse.json({ connectedAccountId: account.id, provider, ...result });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as any).status) : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Contractor sync failed." }, { status });
  }
}
