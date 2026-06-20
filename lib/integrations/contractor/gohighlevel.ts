const DEFAULT_GHL_API_BASE_URL = "https://services.leadconnectorhq.com";
const DEFAULT_GHL_CONTACTS_PATH = "/contacts/";
const DEFAULT_GHL_VERSION = "2021-07-28";

export async function fetchGoHighLevelSnapshot(account: any) {
  const leads = await fetchGoHighLevelContacts(account, { limit: 500, maxPages: 5 });
  const metadata = account.metadata ?? {};
  const locationId = String(metadata.locationId ?? account.external_account_id ?? "").trim();
  const baseUrl = normalizeBaseUrl(
    String(metadata.apiBaseUrl ?? process.env.GHL_API_BASE_URL ?? DEFAULT_GHL_API_BASE_URL)
  );
  const contactsPath = String(metadata.contactsPath ?? process.env.GHL_CONTACTS_PATH ?? DEFAULT_GHL_CONTACTS_PATH);

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

export async function fetchGoHighLevelPreview(account: any, options?: { limit?: number; maxPages?: number }) {
  const rows = await fetchGoHighLevelContacts(account, options);
  const sources = uniqueOptions(rows.map((row: any) => row.source));
  const tags = uniqueOptions(rows.flatMap((row: any) => (Array.isArray(row.tags) ? row.tags : [])));

  return {
    provider: "gohighlevel",
    columns: [
      { key: "name", label: "Contact name" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "source", label: "Contact source" },
      { key: "campaign", label: "Campaign" },
      { key: "createdDate", label: "Created" },
      { key: "tags", label: "Tags" },
    ],
    rows,
    filters: [
      { key: "source", label: "Contact source", options: sources },
      { key: "tags", label: "Tags", options: tags },
    ],
    fieldCatalog: ["name", "phone", "email", "source", "campaign", "createdDate", "tags"],
    totalRows: rows.length,
  };
}

async function fetchGoHighLevelContacts(account: any, options?: { limit?: number; maxPages?: number }) {
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
  const limit = clampPositiveInteger(options?.limit, 100);
  const maxPages = clampPositiveInteger(options?.maxPages, 5);

  for (let iteration = 0; iteration < maxPages && leads.length < limit; iteration += 1) {
    const requestUrl = new URL(contactsPath, baseUrl);
    requestUrl.searchParams.set("locationId", locationId);
    requestUrl.searchParams.set("limit", String(Math.min(limit, 100)));
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

    if (rows.length < Math.min(limit, 100)) break;
    page += 1;
  }

  return leads.slice(0, limit);
}

function normalizeBaseUrl(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function uniqueOptions(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function clampPositiveInteger(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
