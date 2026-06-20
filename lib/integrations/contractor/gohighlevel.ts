const DEFAULT_GHL_API_BASE_URL = "https://services.leadconnectorhq.com";
const DEFAULT_GHL_CONTACTS_PATH = "/contacts/";
const DEFAULT_GHL_VERSION = "2021-07-28";

export async function fetchGoHighLevelSnapshot(account: any) {
  const metadata = account.metadata ?? {};
  const accessToken = String(account.access_token ?? "").trim();
  const locationId = String(metadata.locationId ?? account.external_account_id ?? "").trim();

  if (!accessToken) {
    throw new Error("GoHighLevel access token is missing. Reconnect the account.");
  }

  if (!locationId) {
    throw new Error("GoHighLevel location ID is missing from the connected account.");
  }

  const baseUrl = normalizeBaseUrl(
    String(metadata.apiBaseUrl ?? process.env.GHL_API_BASE_URL ?? DEFAULT_GHL_API_BASE_URL)
  );
  const contactsPath = String(metadata.contactsPath ?? process.env.GHL_CONTACTS_PATH ?? DEFAULT_GHL_CONTACTS_PATH);
  const apiVersion = String(metadata.apiVersion ?? process.env.GHL_API_VERSION ?? DEFAULT_GHL_VERSION);

  const leads = [];
  let page = 1;
  const limit = 100;

  for (let iteration = 0; iteration < 5; iteration += 1) {
    const requestUrl = new URL(contactsPath, baseUrl);
    requestUrl.searchParams.set("locationId", locationId);
    requestUrl.searchParams.set("limit", String(limit));
    requestUrl.searchParams.set("page", String(page));

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
      throw new Error(readProviderError(payload, "GoHighLevel contact sync failed."));
    }

    const rows = extractArray(payload, ["contacts", "data.contacts", "data", "results"]);
    if (!rows.length) break;

    leads.push(
      ...rows.map((row: any) => ({
        id: row.id ?? row.contactId ?? row._id ?? null,
        name: row.name ?? ([row.firstName, row.lastName].filter(Boolean).join(" ").trim() || null),
        email: row.email ?? row.contact?.email ?? null,
        phone: row.phone ?? row.contact?.phone ?? null,
        source: row.source ?? row.attributionSource ?? row.contact_source ?? null,
        campaign: row.campaign ?? row.utmCampaign ?? row.contact_utm_campaign ?? null,
        createdDate: row.dateAdded ?? row.createdAt ?? row.createdOn ?? row.created_date ?? null,
        tags: row.tags ?? row.contactTags ?? [],
        notesSummary: row.notes ?? row.lastMessageBody ?? row.contact?.notes ?? null,
      }))
    );

    if (rows.length < limit) break;
    page += 1;
  }

  return {
    displayName: account.account_label || "GoHighLevel",
    externalAccountId: locationId,
    leads,
    jobs: [],
    spendRows: [],
    settings: {
      syncSource: metadata.authMode === "private_integration" ? "ghl_private_integration" : "ghl_oauth",
      locationId,
      apiBaseUrl: baseUrl,
      contactsPath,
    },
  };
}

function normalizeBaseUrl(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function extractArray(payload: any, paths: string[]) {
  for (const path of paths) {
    const value = path.split(".").reduce((current, key) => current?.[key], payload);
    if (Array.isArray(value)) return value;
  }
  if (Array.isArray(payload)) return payload;
  return [];
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
