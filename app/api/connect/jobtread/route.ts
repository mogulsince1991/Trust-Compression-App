import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/server/route-auth";
import { verifyJobTreadConnection } from "@/lib/integrations/contractor/jobtread";

type ConnectRequest = {
  workspaceId?: string;
  accountLabel?: string;
  grantKey?: string;
  apiToken?: string;
  externalAccountId?: string;
  apiBaseUrl?: string;
  jobsPath?: string;
  authHeaderName?: string;
  authScheme?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ConnectRequest;
    const workspaceId = body.workspaceId?.trim();
    const grantKey = body.grantKey?.trim() || body.apiToken?.trim();

    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });
    if (!grantKey) return NextResponse.json({ error: "JobTread grant key is required." }, { status: 400 });

    const { user, serviceSupabase } = await requireWorkspaceAccess(request, workspaceId);

    const accountLabel = body.accountLabel?.trim() || "JobTread";
    const apiBaseUrl = normalizeUrl(body.apiBaseUrl?.trim() || "https://api.jobtread.com");
    const externalAccountId =
      body.externalAccountId?.trim() || new URL(apiBaseUrl).hostname || "jobtread";
    const pavePath = "/pave";

    const verificationAccount = {
      access_token: grantKey,
      metadata: {
        apiBaseUrl,
        pavePath,
      },
    };

    const verification = await verifyJobTreadConnection(verificationAccount);

    const { data, error } = await serviceSupabase
      .from("connected_accounts")
      .upsert(
        {
          workspace_id: workspaceId,
          user_id: user.id,
          provider: "jobtread",
          external_account_id: externalAccountId,
          account_label: accountLabel,
          access_token: grantKey,
          refresh_token: null,
          token_type: "Bearer",
          scope: "pave_readonly",
          status: "connected",
          metadata: {
            authMode: "pave_grant",
            apiBaseUrl,
            pavePath,
            organizationId: verification.organizationId,
            readonly: true,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,provider,external_account_id" }
      )
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Could not save JobTread account." }, { status: 500 });
    }

    return NextResponse.json({
      connectedAccountId: data.id,
      provider: "jobtread",
      organizationId: verification.organizationId,
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as any).status) : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not connect JobTread." }, { status });
  }
}

function normalizeUrl(value: string) {
  const url = new URL(value);
  return url.toString().endsWith("/") ? url.toString() : `${url.toString()}/`;
}
