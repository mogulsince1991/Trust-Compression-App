import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/server/route-auth";

type ConnectRequest = {
  workspaceId?: string;
  accountLabel?: string;
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
    const apiToken = body.apiToken?.trim();

    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });
    if (!apiToken) return NextResponse.json({ error: "JobTread API token is required." }, { status: 400 });

    const { user, serviceSupabase } = await requireWorkspaceAccess(request, workspaceId);

    const accountLabel = body.accountLabel?.trim() || "JobTread";
    const apiBaseUrl = normalizeUrl(body.apiBaseUrl?.trim() || "https://api.jobtread.com");
    const externalAccountId =
      body.externalAccountId?.trim() || new URL(apiBaseUrl).hostname || "jobtread";

    await verifyJobTreadGrantKey({ apiBaseUrl, grantKey: apiToken });

    const { data, error } = await serviceSupabase
      .from("connected_accounts")
      .upsert(
        {
          workspace_id: workspaceId,
          user_id: user.id,
          provider: "jobtread",
          external_account_id: externalAccountId,
          account_label: accountLabel,
          access_token: apiToken,
          refresh_token: null,
          token_type: "Bearer",
          scope: "open_api",
          status: "connected",
          metadata: {
            authMode: "grant_key",
            apiBaseUrl,
            jobsPath: body.jobsPath?.trim() || "/jobs",
            authHeaderName: body.authHeaderName?.trim() || "Authorization",
            authScheme: body.authScheme?.trim() || "Bearer",
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

    return NextResponse.json({ connectedAccountId: data.id, provider: "jobtread" });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as any).status) : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not connect JobTread." }, { status });
  }
}

function normalizeUrl(value: string) {
  const url = new URL(value);
  return url.toString().endsWith("/") ? url.toString() : `${url.toString()}/`;
}

async function verifyJobTreadGrantKey({
  apiBaseUrl,
  grantKey,
}: {
  apiBaseUrl: string;
  grantKey: string;
}) {
  if (!/^grant[_-]/i.test(grantKey)) {
    throw new Error("That JobTread credential does not look like a Pave grant key. Use the same grant key format as the working local reporting app.");
  }

  const requestUrl = new URL("/pave", apiBaseUrl);
  const response = await fetch(requestUrl.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: {
        currentGrant: {
          id: {},
        },
        $: {
          grantKey,
        },
      },
    }),
    cache: "no-store",
  });

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text ? { raw: text } : null;
  }

  if (!response.ok || !payload?.currentGrant?.id) {
    const detail =
      payload?.message ||
      payload?.error?.message ||
      payload?.errors?.[0]?.message ||
      payload?.raw ||
      "JobTread rejected this grant key.";
    throw new Error(`Could not verify the JobTread grant key. ${String(detail).slice(0, 220)}`);
  }
}
