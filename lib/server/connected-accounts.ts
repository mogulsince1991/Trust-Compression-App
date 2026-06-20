type ConnectedAccountRecord = {
  id: string;
  workspace_id: string;
  provider: string;
  account_label: string | null;
  external_account_id: string | null;
  token_type: string | null;
  scope: string | null;
  status: string;
  expires_at: string | null;
  metadata: Record<string, any> | null;
  created_at: string | null;
  updated_at: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
};

export function sanitizeConnectedAccount(account: ConnectedAccountRecord) {
  const metadata = account.metadata ?? {};

  return {
    id: account.id,
    workspaceId: account.workspace_id,
    provider: account.provider,
    accountLabel: account.account_label,
    externalAccountId: account.external_account_id,
    tokenType: account.token_type,
    scope: account.scope,
    status: account.status,
    expiresAt: account.expires_at,
    metadata: {
      authMode: metadata.authMode ?? null,
      apiBaseUrl: metadata.apiBaseUrl ?? null,
      locationId: metadata.locationId ?? null,
      companyId: metadata.companyId ?? null,
      userId: metadata.userId ?? null,
      readonly: metadata.readonly ?? false,
      lastSyncSummary: metadata.lastSyncSummary ?? null,
    },
    createdAt: account.created_at,
    updatedAt: account.updated_at,
  };
}

export async function listConnectedAccountsForWorkspace(serviceSupabase: any, workspaceId: string) {
  const { data, error } = await serviceSupabase
    .from("connected_accounts")
    .select("id,workspace_id,provider,account_label,external_account_id,token_type,scope,status,expires_at,metadata,created_at,updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: ConnectedAccountRecord) => sanitizeConnectedAccount(row));
}

export async function getConnectedAccountForWorkspace(
  serviceSupabase: any,
  {
    workspaceId,
    connectedAccountId,
    provider,
  }: {
    workspaceId: string;
    connectedAccountId: string;
    provider?: string;
  }
) {
  let query = serviceSupabase
    .from("connected_accounts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", connectedAccountId);

  if (provider) {
    query = query.eq("provider", provider);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw error;
  }

  return (data as ConnectedAccountRecord | null) ?? null;
}
