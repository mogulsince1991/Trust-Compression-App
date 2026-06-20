export type ContractorConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "in"
  | "not_in"
  | "exists"
  | "not_exists"
  | "between"
  | "greater_than"
  | "less_than"
  | "regex"
  | "regex_any"
  | "and"
  | "or";

export type ContractorCondition = {
  id: string;
  field?: string;
  operator: ContractorConditionOperator;
  value?: any;
  caseSensitive?: boolean;
  classification?: string;
  ruleRef?: string;
  conditions?: ContractorCondition[];
};

export type ContractorMetricDefinition = {
  id: string;
  name: string;
  source: string;
  provider: string;
  object: string;
  operation: "count" | "sum" | "average" | "ratio" | "formula" | "classification" | "grouped";
  field?: string | null;
  dateField?: string | null;
  conditions: ContractorCondition[];
  formula?: string | null;
  displayType: "currency" | "percent" | "number" | "ratio" | "days" | "string";
  currentOutputPath?: string | null;
  description?: string | null;
};

export type ContractorGroupedMetricSet = {
  id: string;
  name: string;
  source: string;
  provider: string;
  object: string;
  groupBy: string;
  metricIds: string[];
  description?: string | null;
};

export type ContractorRuleSetRecord = {
  id?: string;
  workspaceId?: string;
  name: string;
  slug: string;
  version: number;
  description: string;
  isDefault: boolean;
  status: "active" | "draft" | "archived";
  providers: Array<{ provider: string; object: string; label: string }>;
  globalFilters: Array<{
    id: string;
    label: string;
    source: string;
    object: string;
    conditions: ContractorCondition[];
  }>;
  classifications: {
    sourceBucket: {
      displayName: string;
      inputFields: string[];
      buckets: Array<{ value: string; match: { operator: string; patterns?: string[] } }>;
    };
    paidVendorAliases: Array<{ vendor: string; aliases: string[]; negativeRule?: string }>;
    soldJob: {
      source: string;
      object: string;
      conditions: ContractorCondition[];
      statuses: string[];
      soldDateFields: string[];
      cancelledPattern: string;
    };
    closingOutcomeRules: Array<{ reason: string; pattern: string; description: string }>;
  };
  metricDefinitions: ContractorMetricDefinition[];
  groupedMetricSets: ContractorGroupedMetricSet[];
  settings: {
    timezone: string;
    attributionLookbackMonths: number;
    spendSourceFallback: "uploaded_first" | "archive_only" | "uploaded_only";
  };
};

export const CONTRACTOR_FIELD_CATALOG = {
  gohighlevel: {
    label: "GoHighLevel",
    objects: {
      contacts: [
        "id",
        "name",
        "email",
        "phone",
        "source",
        "campaign",
        "createdDate",
        "tags",
        "notesSummary",
      ],
      opportunities: ["id", "pipeline", "stage", "status", "value", "createdDate", "closedDate"],
    },
  },
  jobtread: {
    label: "JobTread",
    objects: {
      jobs: [
        "id",
        "jobNumber",
        "customer",
        "email",
        "phone",
        "appointmentDate",
        "soldDate",
        "status",
        "projectType",
        "revenue",
        "netSales",
        "designConsultant",
        "projectManager",
        "source",
        "campaign",
        "notesSummary",
      ],
    },
  },
  spend: {
    label: "Marketing Spend",
    objects: {
      marketing_spend_rows: ["date", "vendor", "channel", "campaign", "spend", "leads", "trackable", "sourceFile"],
    },
  },
  combined: {
    label: "Combined",
    objects: {
      matched_jobs: [
        "job.id",
        "job.appointmentDate",
        "job.soldDate",
        "job.status",
        "job.revenue",
        "job.designConsultant",
        "job.projectType",
        "lead.source",
        "lead.campaign",
        "lead.createdDate",
      ],
      matched_sold_jobs: ["job.id", "job.soldDate", "job.revenue", "lead.source", "lead.campaign", "lead.createdDate"],
      sold_jobs: ["job.id", "job.soldDate", "job.status", "job.revenue", "job.netSales", "job.projectType"],
      appointments: ["job.id", "job.appointmentDate", "job.status", "job.designConsultant"],
    },
  },
} as const;

export const DEFAULT_CONTRACTOR_RULE_SET: ContractorRuleSetRecord = {
  name: "Default Contractor Report",
  slug: "default-contractor-report",
  version: 1,
  description: "Workspace-editable contractor reporting template based on the existing local GHL + JobTread engine.",
  isDefault: true,
  status: "active",
  providers: [
    { provider: "gohighlevel", object: "contacts", label: "GoHighLevel contacts" },
    { provider: "jobtread", object: "jobs", label: "JobTread jobs" },
    { provider: "spend", object: "marketing_spend_rows", label: "Marketing spend rows" },
    { provider: "combined", object: "matched_jobs", label: "Matched leads to jobs" },
  ],
  globalFilters: [
    {
      id: "exclude_not_lead_tags",
      label: "Exclude not-lead tags",
      source: "gohighlevel",
      object: "contacts",
      conditions: [
        { id: "exclude_not_lead_tags_1", field: "tags", operator: "not_contains", value: "not_lead", caseSensitive: false },
        { id: "exclude_not_lead_tags_2", field: "tags", operator: "not_contains", value: "not a lead", caseSensitive: false },
      ],
    },
  ],
  classifications: {
    sourceBucket: {
      displayName: "Source Bucket",
      inputFields: ["source", "campaign", "notesSummary"],
      buckets: [
        {
          value: "paid",
          match: {
            operator: "regex_any",
            patterns: [
              "(^|\\b)(fb|facebook|meta)\\s*ad(s)?\\b",
              "\\bgoogle\\s*(ad|ads|lsa)\\b",
              "\\blocal service ads?\\b",
              "\\bangi\\b",
              "\\bsalty'?s media\\b",
              "\\bwave\\b",
              "\\bradio i\\/?o guys\\b",
              "\\bdetroit radio\\b",
            ],
          },
        },
        {
          value: "organic",
          match: {
            operator: "regex_any",
            patterns: [
              "\\borganic\\b",
              "\\breferral\\b",
              "\\bself gen\\b",
              "\\bwebsite direct\\b",
              "\\blive chat\\b",
              "\\bgoogle organic\\b",
              "\\bfb organic\\b",
            ],
          },
        },
        { value: "unattributed", match: { operator: "fallback" } },
      ],
    },
    paidVendorAliases: [
      { vendor: "Salty's Media", aliases: ["wave", "salty", "saltys media", "salty's media"] },
      { vendor: "Detroit Radio LLC", aliases: ["detroit radio", "radio i/o guys", "radio io guys"] },
      { vendor: "Angi Leads", aliases: ["angi", "angi leads"] },
      { vendor: "FaceBook", aliases: ["fb ad", "facebook ad", "facebook ads", "meta ad", "meta ads"] },
      { vendor: "Google", aliases: ["google ad", "google ads", "google lsa", "local service ads", "lsa"], negativeRule: "Do not match Google Organic" },
    ],
    soldJob: {
      source: "jobtread",
      object: "jobs",
      conditions: [
        { id: "sold_job_condition_not_cancelled", field: "cancelled", operator: "equals", value: false },
        {
          id: "sold_job_condition_primary",
          operator: "or",
          conditions: [
            { id: "sold_job_condition_has_sold_date", field: "soldDate", operator: "exists" },
            { id: "sold_job_condition_status_in", field: "status", operator: "in", value: ["sold", "approved", "contract signed"], caseSensitive: false },
          ],
        },
      ],
      statuses: ["sold", "approved", "contract signed"],
      soldDateFields: ["soldDate", "jobSoldDate", "Sold Date"],
      cancelledPattern: "cancel",
    },
    closingOutcomeRules: [
      { reason: "One-Leg Appointment", pattern: "\\bone[- ]?leg\\b|decision[- ]?maker|spouse|husband|wife|partner|both.*present", description: "A required decision-maker was absent or unavailable." },
      { reason: "Lost to Price Gap", pattern: "price|pricing|too high|expensive|budget|sticker|cost gap|half[- ]?price", description: "The quoted project cost appears to exceed the customer's expectations or budget." },
      { reason: "Lost to Competitor", pattern: "competitor|another company|other quote|went with|chose .* else|lower bid", description: "The customer appears to have selected another provider or competing quote." },
      { reason: "Not Ready / Timing", pattern: "not ready|timing|later|future|maybe one day|hold off|postpone|next year", description: "The customer is delaying or not ready to move forward." },
      { reason: "Could Not Contact", pattern: "could not contact|no answer|left voicemail|no response|unresponsive|bad phone|dnd|stop", description: "Follow-up did not reach the customer or the customer stopped responding." },
      { reason: "Canceled / No-Show", pattern: "cancel|cancelled|canceled|no[- ]?show|reschedule", description: "The appointment was canceled, missed, or repeatedly rescheduled." },
      { reason: "Financing Issue", pattern: "financ|loan|approved|credit", description: "The deal appears blocked by financing or credit approval." },
      { reason: "Pending Board / Family", pattern: "board|hoa|family|talk to|discuss|approval", description: "The decision is pending external approval or family discussion." },
    ],
  },
  metricDefinitions: [
    metric("overall_spend", "Overall Spend", "spend", "marketing_spend_rows", "sum", { field: "spend", displayType: "currency", currentOutputPath: "metrics.totals.spend" }),
    metric("overall_leads", "Overall Leads", "gohighlevel", "contacts", "count", { displayType: "number", currentOutputPath: "metrics.totals.leads", conditions: [{ id: "overall_leads_created", field: "createdDate", operator: "between", value: ["startDate", "endDate"] }, { id: "overall_leads_filter_ref", ruleRef: "exclude_not_lead_tags", operator: "and" }] }),
    metric("paid_leads", "Paid Leads", "gohighlevel", "contacts", "count", { displayType: "number", currentOutputPath: "metrics.totals.paidLeads", conditions: [{ id: "paid_leads_bucket", classification: "sourceBucket", operator: "equals", value: "paid" }] }),
    metric("organic_leads", "Organic Leads", "gohighlevel", "contacts", "count", { displayType: "number", currentOutputPath: "metrics.totals.organicLeads", conditions: [{ id: "organic_leads_bucket", classification: "sourceBucket", operator: "not_equals", value: "paid" }] }),
    metric("overall_appointments", "Appointments Booked", "jobtread", "jobs", "count", { displayType: "number", currentOutputPath: "metrics.totals.issuedLeads", dateField: "appointmentDate", conditions: [{ id: "overall_appointments_date", field: "appointmentDate", operator: "between", value: ["startDate", "endDate"] }] }),
    metric("paid_appointments", "Paid Appointments", "combined", "matched_jobs", "count", { displayType: "number", currentOutputPath: "metrics.totals.paidIssuedLeads", conditions: [{ id: "paid_appointments_bucket", classification: "sourceBucket", operator: "equals", value: "paid" }] }),
    metric("organic_appointments", "Organic Appointments", "combined", "matched_jobs", "count", { displayType: "number", currentOutputPath: "metrics.totals.organicIssuedLeads", conditions: [{ id: "organic_appointments_bucket", classification: "sourceBucket", operator: "not_equals", value: "paid" }] }),
    metric("overall_sold_jobs", "Sold Jobs", "jobtread", "jobs", "count", { displayType: "number", currentOutputPath: "metrics.totals.soldJobs", dateField: "soldDate", conditions: [{ id: "overall_sold_jobs_rule", ruleRef: "soldJob", operator: "and" }] }),
    metric("paid_sold_jobs", "Paid Sold Jobs", "combined", "matched_sold_jobs", "count", { displayType: "number", currentOutputPath: "metrics.totals.paidSoldJobs", conditions: [{ id: "paid_sold_jobs_bucket", classification: "sourceBucket", operator: "equals", value: "paid" }] }),
    metric("organic_sold_jobs", "Organic Sold Jobs", "combined", "matched_sold_jobs", "count", { displayType: "number", currentOutputPath: "metrics.totals.organicSoldJobs", conditions: [{ id: "organic_sold_jobs_bucket", classification: "sourceBucket", operator: "not_equals", value: "paid" }] }),
    metric("overall_revenue", "Revenue", "jobtread", "sold_jobs", "sum", { field: "revenue", displayType: "currency", currentOutputPath: "metrics.totals.revenue" }),
    metric("paid_revenue", "Paid Revenue", "combined", "matched_sold_jobs", "sum", { field: "job.revenue", displayType: "currency", currentOutputPath: "metrics.totals.paidRevenue", conditions: [{ id: "paid_revenue_bucket", classification: "sourceBucket", operator: "equals", value: "paid" }] }),
    metric("organic_revenue", "Organic Revenue", "combined", "sold_jobs", "formula", { formula: "overall_revenue - paid_revenue", displayType: "currency", currentOutputPath: "metrics.totals.organicRevenue" }),
    metric("paid_roas", "Paid ROAS", "combined", "matched_sold_jobs", "formula", { formula: "paid_revenue / overall_spend", displayType: "ratio", currentOutputPath: "metrics.totals.roas" }),
    metric("cost_per_paid_lead", "CPL", "combined", "matched_jobs", "formula", { formula: "overall_spend / paid_leads", displayType: "currency", currentOutputPath: "metrics.totals.costPerLead" }),
    metric("overall_close_rate", "Close Rate", "combined", "matched_jobs", "formula", { formula: "overall_sold_jobs / overall_appointments", displayType: "percent", currentOutputPath: "metrics.totals.closeRate" }),
    metric("overall_nsli", "NSLI", "combined", "matched_jobs", "formula", { formula: "overall_revenue / overall_appointments", displayType: "currency", currentOutputPath: "metrics.totals.netSalesPerLeadIssued" }),
    metric("average_ticket", "Average Ticket", "jobtread", "sold_jobs", "formula", { formula: "overall_revenue / overall_sold_jobs", displayType: "currency", currentOutputPath: "metrics.totals.averageJobSize" }),
    metric("average_time_to_close", "Average Time To Close", "combined", "matched_sold_jobs", "average", { field: "timeToCloseDays", displayType: "days", currentOutputPath: "metrics.totals.averageTimeToCloseDays" }),
  ],
  groupedMetricSets: [
    grouped("paid_channel_performance", "Paid Channel Performance", "spend", "marketing_spend_rows", "vendor", ["overall_spend", "paid_leads", "paid_appointments", "paid_sold_jobs", "paid_revenue", "paid_roas"]),
    grouped("design_consultant_performance", "Design Consultant Performance", "jobtread", "jobs", "designConsultant", ["overall_appointments", "overall_sold_jobs", "overall_revenue", "overall_close_rate", "overall_nsli"]),
    grouped("leads_by_source", "Leads By Source", "gohighlevel", "contacts", "source", ["overall_leads", "overall_appointments", "overall_sold_jobs", "overall_revenue", "overall_close_rate", "overall_nsli"]),
    grouped("closing_outcomes", "Why Jobs Aren't Closing", "jobtread", "jobs", "status", ["overall_appointments"]),
  ],
  settings: {
    timezone: "America/New_York",
    attributionLookbackMonths: 12,
    spendSourceFallback: "uploaded_first",
  },
};

export function createDefaultContractorRuleSet(name = DEFAULT_CONTRACTOR_RULE_SET.name): ContractorRuleSetRecord {
  return {
    ...deepClone(DEFAULT_CONTRACTOR_RULE_SET),
    name,
    slug: slugify(name),
  };
}

export function toRuntimeMetricRules(ruleSet?: Partial<ContractorRuleSetRecord> | null) {
  const base = DEFAULT_CONTRACTOR_RULE_SET;
  const current = ruleSet ?? {};
  const excludedLeadTagPhrases = (current.globalFilters ?? base.globalFilters)
    .filter((filter) => filter.id === "exclude_not_lead_tags")
    .flatMap((filter) => filter.conditions.map((condition) => String(condition.value ?? "").toLowerCase()).filter(Boolean));

  return {
    version: `workspace-${current.version ?? base.version}`,
    timezone: current.settings?.timezone ?? base.settings.timezone,
    globalFilters: {
      excludedLeadTagPhrases: excludedLeadTagPhrases.length
        ? excludedLeadTagPhrases
        : base.globalFilters.flatMap((filter) => filter.conditions.map((condition) => String(condition.value ?? "").toLowerCase()).filter(Boolean)),
    },
    classification: {
      soldJob: {
        statuses: current.classifications?.soldJob?.statuses ?? base.classifications.soldJob.statuses,
        soldDateFields: current.classifications?.soldJob?.soldDateFields ?? base.classifications.soldJob.soldDateFields,
        cancelledPattern: current.classifications?.soldJob?.cancelledPattern ?? base.classifications.soldJob.cancelledPattern,
      },
      paidVendorAliases: current.classifications?.paidVendorAliases ?? base.classifications.paidVendorAliases,
      paidSourcePatterns:
        current.classifications?.sourceBucket?.buckets.find((bucket) => bucket.value === "paid")?.match.patterns ??
        base.classifications.sourceBucket.buckets.find((bucket) => bucket.value === "paid")?.match.patterns ??
        [],
      organicSourcePatterns:
        current.classifications?.sourceBucket?.buckets.find((bucket) => bucket.value === "organic")?.match.patterns ??
        base.classifications.sourceBucket.buckets.find((bucket) => bucket.value === "organic")?.match.patterns ??
        [],
    },
    closingOutcomeRules: current.classifications?.closingOutcomeRules ?? base.classifications.closingOutcomeRules,
  };
}

export function normalizeStoredRuleSet(row: any): ContractorRuleSetRecord {
  const base = createDefaultContractorRuleSet(row?.name ?? DEFAULT_CONTRACTOR_RULE_SET.name);
  return {
    ...base,
    id: row?.id,
    workspaceId: row?.workspace_id,
    name: row?.name ?? base.name,
    slug: row?.slug ?? base.slug,
    version: Number(row?.version ?? base.version),
    description: row?.description ?? base.description,
    isDefault: Boolean(row?.is_default ?? base.isDefault),
    status: row?.status ?? base.status,
    providers: row?.providers ?? base.providers,
    globalFilters: row?.global_filters ?? base.globalFilters,
    classifications: {
      ...base.classifications,
      ...(row?.classifications ?? {}),
    },
    metricDefinitions: row?.metric_definitions ?? base.metricDefinitions,
    groupedMetricSets: row?.grouped_metric_sets ?? base.groupedMetricSets,
    settings: {
      ...base.settings,
      ...(row?.settings ?? {}),
    },
  };
}

export function slugify(value: string) {
  const cleaned = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "contractor-rule-set";
}

function metric(
  id: string,
  name: string,
  provider: string,
  object: string,
  operation: ContractorMetricDefinition["operation"],
  overrides: Partial<ContractorMetricDefinition> = {}
): ContractorMetricDefinition {
  return {
    id,
    name,
    source: provider,
    provider,
    object,
    operation,
    field: null,
    dateField: null,
    conditions: [],
    formula: null,
    displayType: "number",
    currentOutputPath: null,
    description: null,
    ...overrides,
  };
}

function grouped(
  id: string,
  name: string,
  provider: string,
  object: string,
  groupBy: string,
  metricIds: string[]
): ContractorGroupedMetricSet {
  return {
    id,
    name,
    source: provider,
    provider,
    object,
    groupBy,
    metricIds,
  };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
