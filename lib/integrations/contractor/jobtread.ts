const DEFAULT_JOBTREAD_API_BASE_URL = "https://api.jobtread.com";
const DEFAULT_JOBTREAD_PAVE_PATH = "/pave";
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 60;
const DEFAULT_MAX_JOBS = 5000;

export async function fetchJobTreadSnapshot(
  account: any,
  options?: { limit?: number; maxPages?: number; startDate?: string; endDate?: string }
) {
  const jobs = await fetchJobTreadRows(account, {
    limit: options?.limit ?? DEFAULT_MAX_JOBS,
    maxPages: options?.maxPages,
    includeAllRows: true,
  });
  const metadata = account.metadata ?? {};
  const baseUrl = normalizeBaseUrl(
    String(metadata.apiBaseUrl ?? process.env.JOBTREAD_API_BASE_URL ?? DEFAULT_JOBTREAD_API_BASE_URL)
  );
  const pavePath = String(metadata.pavePath ?? process.env.JOBTREAD_PAVE_PATH ?? DEFAULT_JOBTREAD_PAVE_PATH);

  return {
    displayName: account.account_label || "JobTread",
    externalAccountId: account.external_account_id || jobs[0]?.organizationId || account.id,
    leads: [],
    jobs,
    spendRows: [],
    settings: {
      syncSource: "jobtread_pave",
      apiBaseUrl: baseUrl,
      pavePath,
      organizationId: jobs[0]?.organizationId ?? null,
    },
  };
}

export async function fetchJobTreadPreview(
  account: any,
  options?: { limit?: number; maxPages?: number; startDate?: string; endDate?: string }
) {
  const rows = await fetchJobTreadRows(account, {
    ...options,
    includeAllRows: false,
  });

  return {
    provider: "jobtread",
    columns: [
      { key: "jobNumber", label: "Job number" },
      { key: "customer", label: "Customer" },
      { key: "createdAt", label: "Created" },
      { key: "soldDate", label: "Sold date" },
      { key: "status", label: "Status" },
      { key: "projectType", label: "Project type" },
      { key: "designConsultant", label: "Design consultant" },
      { key: "source", label: "Lead source" },
      { key: "revenue", label: "Revenue" },
    ],
    rows,
    filters: [
      { key: "status", label: "Status", options: uniqueOptions(rows.map((row: any) => row.status)) },
      { key: "source", label: "Lead source", options: uniqueOptions(rows.map((row: any) => row.source)) },
      { key: "projectType", label: "Project type", options: uniqueOptions(rows.map((row: any) => row.projectType)) },
      { key: "designConsultant", label: "Design consultant", options: uniqueOptions(rows.map((row: any) => row.designConsultant)) },
    ],
    fieldCatalog: [
      "jobNumber",
      "customer",
      "createdAt",
      "soldDate",
      "status",
      "projectType",
      "designConsultant",
      "projectManager",
      "source",
      "campaign",
      "revenue",
      "notesSummary",
    ],
    totalRows: rows.length,
  };
}

async function fetchJobTreadRows(
  account: any,
  options?: { limit?: number; maxPages?: number; startDate?: string; endDate?: string; includeAllRows?: boolean }
) {
  const metadata = account.metadata ?? {};
  const grantKey = String(account.access_token ?? "").trim();

  if (!grantKey) {
    throw new Error("JobTread grant key is missing. Reconnect the account.");
  }

  const baseUrl = normalizeBaseUrl(
    String(metadata.apiBaseUrl ?? process.env.JOBTREAD_API_BASE_URL ?? DEFAULT_JOBTREAD_API_BASE_URL)
  );
  const pavePath = String(metadata.pavePath ?? process.env.JOBTREAD_PAVE_PATH ?? DEFAULT_JOBTREAD_PAVE_PATH);
  const pageSize = clampPositiveInteger(metadata.pageSize, DEFAULT_PAGE_SIZE);
  const maxPages = clampPositiveInteger(options?.maxPages ?? metadata.maxPages, DEFAULT_MAX_PAGES);
  const maxJobs = clampPositiveInteger(options?.limit, DEFAULT_MAX_JOBS);
  const startDate = String(options?.startDate ?? "").trim();
  const endDate = String(options?.endDate ?? "").trim();
  const includeAllRows = options?.includeAllRows === true;

  const organizationId = await getOrganizationId({ baseUrl, pavePath, grantKey });
  const jobs = await listJobs({ baseUrl, pavePath, grantKey, organizationId, pageSize, maxPages, maxJobs });
  const detailRows = [];

  for (const job of jobs) {
    const detail = await getJobDetail({ baseUrl, pavePath, grantKey, jobId: job.id });
    if (detail?.job) {
      detailRows.push({ ...normalizeJob(detail.job), organizationId });
    }
  }

  const rows = includeAllRows
    ? detailRows
    : detailRows.filter((row) => matchesReportDateWindow(row, startDate, endDate));

  return rows.slice(0, maxJobs);
}

async function getOrganizationId({
  baseUrl,
  pavePath,
  grantKey,
}: {
  baseUrl: string;
  pavePath: string;
  grantKey: string;
}) {
  const payload = await paveQuery({
    baseUrl,
    pavePath,
    grantKey,
    query: {
      currentGrant: {
        user: {
          memberships: {
            nodes: {
              organization: {
                id: {},
              },
            },
          },
        },
      },
    },
  });

  const organizationId = payload?.currentGrant?.user?.memberships?.nodes?.[0]?.organization?.id;
  if (!organizationId) {
    throw new Error("Could not discover the JobTread organization from this grant key.");
  }
  return String(organizationId);
}

async function listJobs({
  baseUrl,
  pavePath,
  grantKey,
  organizationId,
  pageSize,
  maxPages,
  maxJobs,
}: {
  baseUrl: string;
  pavePath: string;
  grantKey: string;
  organizationId: string;
  pageSize: number;
  maxPages: number;
  maxJobs: number;
}) {
  const jobs = [];
  let nextPage: string | null = null;

  for (let pageIndex = 0; pageIndex < maxPages && jobs.length < maxJobs; pageIndex += 1) {
    const params: Record<string, any> = {
      size: pageSize,
      sortBy: [{ field: "number", order: "desc" }],
    };

    if (nextPage) {
      params.page = nextPage;
    }

    const payload = await paveQuery({
      baseUrl,
      pavePath,
      grantKey,
      query: {
        organization: {
          $: { id: organizationId },
          jobs: {
            $: params,
            nodes: {
              id: {},
              name: {},
              number: {},
            },
            nextPage: {},
          },
        },
      },
    });

    const pageJobs = Array.isArray(payload?.organization?.jobs?.nodes) ? payload.organization.jobs.nodes : [];
    jobs.push(...pageJobs);
    nextPage = payload?.organization?.jobs?.nextPage ?? null;

    if (!pageJobs.length || !nextPage) {
      break;
    }
  }

  return jobs.slice(0, maxJobs);
}

async function getJobDetail({
  baseUrl,
  pavePath,
  grantKey,
  jobId,
}: {
  baseUrl: string;
  pavePath: string;
  grantKey: string;
  jobId: string;
}) {
  return paveQuery({
    baseUrl,
    pavePath,
    grantKey,
    query: {
      job: {
        $: { id: jobId },
        id: {},
        name: {},
        number: {},
        createdAt: {},
        closedOn: {},
        projectedPrice: {},
        projectedPriceWithTax: {},
        location: {
          account: {
            name: {},
          },
        },
        customFieldValues: {
          $: { size: 50 },
          nodes: {
            value: {},
            customField: {
              name: {},
            },
          },
        },
        documents: {
          nodes: {
            id: {},
            type: {},
            status: {},
            closedAt: {},
            signedAt: {},
            issueDate: {},
            name: {},
            price: {},
            priceWithTax: {},
            amountPaid: {},
          },
        },
      },
    },
  });
}

async function paveQuery({
  baseUrl,
  pavePath,
  grantKey,
  query,
}: {
  baseUrl: string;
  pavePath: string;
  grantKey: string;
  query: Record<string, any>;
}) {
  const requestUrl = new URL(pavePath, baseUrl);
  const response = await fetch(requestUrl.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: {
        ...query,
        $: {
          ...(query.$ ?? {}),
          grantKey,
        },
      },
    }),
    cache: "no-store",
  });

  const payload = await safeJson(response);
  if (!response.ok) {
    throw new Error(readProviderError(payload, "JobTread Pave sync failed."));
  }

  return payload;
}

function normalizeJob(job: any) {
  const fields = customFieldMap(job.customFieldValues?.nodes ?? []);
  const documents = Array.isArray(job.documents?.nodes) ? job.documents.nodes : [];
  const soldDate = firstField(fields, ["job_sold_date", "sold_date", "date_sold", "sale_date", "contract_signed_date", "closed_won_date"]);
  const revenue =
    toNumber(job.projectedPriceWithTax ?? job.projectedPrice) ||
    revenueFromFields(fields);
  const status = firstField(fields, ["status", "job_status", "appointment_result"]) ?? statusFromDocuments(documents);

  return {
    id: job.id ?? null,
    jobId: job.id ?? null,
    jobNumber: job.number ?? null,
    customer: job.location?.account?.name ?? job.name ?? null,
    email: firstField(fields, ["email", "customer_email"]),
    phone: firstField(fields, ["phone", "customer_phone"]),
    appointmentDate: job.createdAt ?? null,
    createdAt: job.createdAt ?? null,
    closedOn: job.closedOn ?? null,
    soldDate,
    status,
    projectType: firstField(fields, ["job_type_category", "project_type", "job_type", "category", "type"]),
    revenue,
    netSales: revenue,
    designConsultant: firstField(fields, ["project_design_consultant", "design_consultant", "estimator", "sales_rep", "salesperson", "sales_person", "consultant"]),
    projectManager: firstField(fields, ["project_manager"]),
    source: firstField(fields, ["source", "lead_source", "ghl_source", "marketing_source"]),
    campaign: firstField(fields, ["campaign", "utm_campaign"]),
    notesSummary: notesFromFields(fields),
  };
}

function customFieldMap(nodes: any[]) {
  const map: Record<string, string> = {};

  for (const node of nodes) {
    const key = String(node?.customField?.name ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

    if (key) {
      const value = stringifyValue(node?.value);
      if (value) {
        map[key] = value;
      }
    }
  }

  return map;
}

function firstField(fields: Record<string, string>, names: string[]) {
  for (const name of names) {
    if (fields[name]) return fields[name];
  }
  return null;
}

function revenueFromFields(fields: Record<string, string>) {
  return toNumber(firstField(fields, ["revenue", "contract_amount", "sold_price", "contract_value", "net_sales", "approved_orders"]));
}

function approvedOrderSoldDate(documents: any[]) {
  const dates = approvedOrderDocuments(documents)
    .map((doc) => normalizeDocumentDate(doc?.closedAt))
    .filter(Boolean)
    .sort();
  return dates[0] ?? null;
}

function approvedOrderDocuments(documents: any[]) {
  return documents.filter((doc) => isApprovedCustomerOrder(doc));
}

function isApprovedCustomerOrder(doc: any) {
  const type = String(doc?.type ?? "");
  const status = String(doc?.status ?? "");
  const customerOrderLike = /customerorder/i.test(type);
  const approvedLike = /approved|paid|closed/i.test(status) || Boolean(doc?.closedAt);
  return customerOrderLike && approvedLike;
}

function statusFromDocuments(documents: any[]) {
  if (approvedOrderDocuments(documents).length) return "Sold";
  return "Open";
}

function normalizeDocumentDate(value: any) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function notesFromFields(fields: Record<string, string>) {
  return Object.entries(fields)
    .filter(([key]) => /note|result|reason|objection|summary|comment/i.test(key))
    .map(([key, value]) => `${key}: ${value}`)
    .join(" | ")
    .slice(0, 1000);
}

function stringifyValue(value: any) {
  if (value == null) return null;
  if (typeof value === "object") {
    return value.value ?? value.name ?? value.label ?? JSON.stringify(value);
  }
  return String(value);
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const number = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(number) ? number : 0;
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

function inOptionalDateRange(value: unknown, startDate: string, endDate: string) {
  if (!startDate && !endDate) return true;
  if (!value) return false;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return false;
  if (startDate) {
    const start = new Date(`${startDate}T00:00:00`);
    if (date < start) return false;
  }
  if (endDate) {
    const end = new Date(`${endDate}T23:59:59`);
    if (date > end) return false;
  }
  return true;
}

function matchesReportDateWindow(
  row: { appointmentDate?: unknown; soldDate?: unknown },
  startDate: string,
  endDate: string
) {
  if (!startDate && !endDate) return true;
  return (
    inOptionalDateRange(row.appointmentDate, startDate, endDate) ||
    inOptionalDateRange(row.soldDate, startDate, endDate)
  );
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readProviderError(payload: any, fallback: string) {
  return payload?.message || payload?.error?.message || payload?.error || payload?.errors?.[0]?.message || fallback;
}
