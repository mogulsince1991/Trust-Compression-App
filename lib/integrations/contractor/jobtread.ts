const DEFAULT_JOBTREAD_API_BASE_URL = "https://api.jobtread.com";
const DEFAULT_JOBTREAD_JOBS_PATH = "/jobs";

export async function fetchJobTreadSnapshot(account: any) {
  const metadata = account.metadata ?? {};
  const accessToken = String(account.access_token ?? "").trim();

  if (!accessToken) {
    throw new Error("JobTread API token is missing. Reconnect the account.");
  }

  const baseUrl = normalizeBaseUrl(
    String(metadata.apiBaseUrl ?? process.env.JOBTREAD_API_BASE_URL ?? DEFAULT_JOBTREAD_API_BASE_URL)
  );
  const jobsPath = String(metadata.jobsPath ?? process.env.JOBTREAD_JOBS_PATH ?? DEFAULT_JOBTREAD_JOBS_PATH);
  const authHeaderName = String(metadata.authHeaderName ?? process.env.JOBTREAD_AUTH_HEADER_NAME ?? "Authorization");
  const authScheme = String(metadata.authScheme ?? process.env.JOBTREAD_AUTH_SCHEME ?? "Bearer");

  const jobs = [];
  let page = 1;
  const limit = 100;

  for (let iteration = 0; iteration < 5; iteration += 1) {
    const requestUrl = new URL(jobsPath, baseUrl);
    requestUrl.searchParams.set("page", String(page));
    requestUrl.searchParams.set("limit", String(limit));

    const headers: Record<string, string> = { Accept: "application/json" };
    headers[authHeaderName] =
      authHeaderName.toLowerCase() === "authorization" ? `${authScheme} ${accessToken}` : accessToken;

    const response = await fetch(requestUrl.toString(), {
      headers,
      cache: "no-store",
    });

    const payload = await safeJson(response);
    if (!response.ok) {
      throw new Error(readProviderError(payload, "JobTread job sync failed."));
    }

    const rows = extractArray(payload, ["jobs", "data.jobs", "data", "results", "items"]);
    if (!rows.length) break;

    jobs.push(...rows.map((row: any) => flattenJob(row)));

    if (rows.length < limit) break;
    page += 1;
  }

  return {
    displayName: account.account_label || "JobTread",
    externalAccountId: account.external_account_id || account.id,
    leads: [],
    jobs,
    spendRows: [],
    settings: {
      syncSource: "jobtread_api",
      apiBaseUrl: baseUrl,
      jobsPath,
      authHeaderName,
      authScheme,
    },
  };
}

function flattenJob(row: any) {
  const customer = row.customer ?? row.customerName ?? row.client ?? row.clientName ?? row.homeowner ?? row.owner;

  return {
    ...row,
    id: row.id ?? row.jobId ?? row.rawId ?? row.uuid ?? null,
    jobId: row.jobId ?? row.id ?? row.uuid ?? null,
    jobNumber: row.jobNumber ?? row.number ?? row.code ?? row.referenceNumber ?? null,
    customer: customer?.name ?? customer?.fullName ?? customer ?? row.name ?? null,
    email: row.email ?? customer?.email ?? customer?.primaryEmail ?? null,
    phone: row.phone ?? customer?.phone ?? customer?.mobilePhone ?? customer?.primaryPhone ?? null,
    appointmentDate: row.appointmentDate ?? row.createdAt ?? row.createdOn ?? null,
    soldDate: row.soldDate ?? row.contractSignedAt ?? row.closedAt ?? null,
    status: row.status ?? row.stage ?? null,
    projectType: row.projectType ?? row.jobType ?? row.category ?? null,
    revenue: row.revenue ?? row.contractAmount ?? row.total ?? row.soldPrice ?? null,
    netSales: row.netSales ?? row.revenue ?? row.contractAmount ?? row.total ?? row.soldPrice ?? null,
    designConsultant: row.designConsultant ?? row.estimator ?? row.salesRep ?? null,
    projectManager: row.projectManager ?? row.manager ?? null,
    source: row.source ?? row.leadSource ?? null,
    campaign: row.campaign ?? row.utmCampaign ?? null,
    notesSummary: row.notesSummary ?? row.notes ?? row.description ?? null,
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
