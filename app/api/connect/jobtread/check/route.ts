import { NextResponse } from "next/server";
import { requireWorkspaceAccess, requireWorkspaceManager } from "@/lib/server/route-auth";
import { getConnectedAccountForWorkspace } from "@/lib/server/connected-accounts";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { workspaceId, connectedAccountId } = await request.json();
    if (typeof workspaceId !== "string" || typeof connectedAccountId !== "string") return NextResponse.json({ error: "Choose a workspace and JobTread account." }, { status: 400 });
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, workspaceId));
    const account = await getConnectedAccountForWorkspace(context.serviceSupabase, { workspaceId, connectedAccountId, provider: "jobtread" });
    if (!account?.access_token) return NextResponse.json({ error: "No saved JobTread credential was found." }, { status: 404 });
    // Fixed provider destination and read-only query; no caller-supplied URLs or queries.
    const response = await fetch("https://api.jobtread.com/pave", {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
      body: JSON.stringify({ query: { $: { grantKey: account.access_token }, currentGrant: { user: { memberships: { nodes: { organization: { id: {} } } } } } } }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const error = [401, 403].includes(response.status) ? "JobTread rejected the saved credential. Reconnect the account." : response.status === 429 ? "JobTread is rate limiting requests. Try again shortly." : `JobTread returned HTTP ${response.status}. The provider could not complete the check.`;
      return NextResponse.json({ error }, { status: 502 });
    }
    const data = await response.json();
    const organizations = data?.currentGrant?.user?.memberships?.nodes ?? [];
    const expected = account.metadata?.organizationId;
    if (!organizations.some((row: any) => row.organization?.id && (!expected || row.organization.id === expected))) return NextResponse.json({ error: "JobTread responded, but the saved organization is not accessible with this credential." }, { status: 502 });
    return NextResponse.json({ message: "Direct JobTread connection is working. The saved credential can access your organization.", checkedAt: new Date().toISOString() });
  } catch (error: any) {
    const status = [401, 403].includes(error?.status) ? error.status : 502;
    return NextResponse.json({ error: status === 401 ? "Sign in again to check the connection." : status === 403 ? "Only workspace owners and admins can check this connection." : error?.name === "TimeoutError" ? "JobTread did not respond within 20 seconds. Try again shortly." : "The direct connection check failed. Try again; no credentials were changed." }, { status });
  }
}
