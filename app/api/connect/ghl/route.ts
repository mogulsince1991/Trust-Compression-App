import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/server/route-auth";

type ConnectRequest = {
  workspaceId?: string;
  accountLabel?: string;
  privateIntegrationToken?: string;
  locationId?: string;
  externalAccountId?: string;
  apiBaseUrl?: string;
  contactsPath?: string;
  apiVersion?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ConnectRequest;
    const workspaceId = body.workspaceId?.trim();
    const privateIntegrationToken = body.privateIntegrationToken?.trim();
    const locationId = body.locationId?.trim();

    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });
    if (!privateIntegrationToken) {
      return NextResponse.json({ error: "GoHighLevel Private Integration token is required." }, { status: 400 });
    }
    if (!locationId) return NextResponse.json({ error: "GoHighLevel location ID is required." }, { status: 400 });

    const { user, serviceSupabase } = await requireWorkspaceAccess(request, workspaceId);

    const accountLabel = body.accountLabel?.trim() || "GoHighLevel";
    const apiBaseUrl = normalizeUrl(body.apiBaseUrl?.trim() || "https://services.leadconnectorhq.com");
    const contactsPath = body.contactsPath?.trim() || "/contacts/";
    const apiVersion = body.apiVersion?.trim() || "2021-07-28";
    const externalAccountId = body.externalAccountId?.trim() || locationId;
    await verifyGoHighLevelCredentials({
      accessToken: privateIntegrationToken,
      locationId,
      apiBaseUrl,
      contactsPath,
      apiVersion,
    });

    const { data, error } = await serviceSupabase
      .from("connected_accounts")
      .upsert(
        {
          workspace_id: workspaceId,
          user_id: user.id,
          provider: "ghl",
          external_account_id: externalAccountId,
          account_label: accountLabel,
          access_token: privateIntegrationToken,
          refresh_token: null,
          token_type: "Bearer",
          scope: "private_integration",
          status: "connected",
          metadata: {
            authMode: "private_integration",
            locationId,
            apiBaseUrl,
            contactsPath,
            apiVersion,
            verifiedAt: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,provider,external_account_id" }
      )
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Could not save GoHighLevel account." }, { status: 500 });
    }

    return NextResponse.json({ connectedAccountId: data.id, provider: "ghl" });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as any).status) : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not connect GoHighLevel." },
      { status }
    );
  }
}

function normalizeUrl(value: string) {
  const withProtocol = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  return url.toString().endsWith("/") ? url.toString() : `${url.toString()}/`;
}

async function verifyGoHighLevelCredentials({
  accessToken,
  locationId,
  apiBaseUrl,
  contactsPath,
  apiVersion,
}: {
  accessToken: string;
  locationId: string;
  apiBaseUrl: string;
  contactsPath: string;
  apiVersion: string;
}) {
  const requestUrl = new URL(contactsPath, apiBaseUrl);
  requestUrl.searchParams.set("locationId", locationId);
  requestUrl.searchParams.set("limit", "1");
  requestUrl.searchParams.set("page", "1");

  const response = await fetch(requestUrl.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      Version: apiVersion,
    },
    cache: "no-store",
  });

  const payload = await safeJson(response);
  if (!response.ok) {
    throw new Error(readProviderError(payload, "GoHighLevel rejected the token or location ID."));
  }
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readProviderError(payload: any, fallback: string) {
  return payload?.message || payload?.error?.message || payload?.error || fallback;
}
