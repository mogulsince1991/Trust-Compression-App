import { hasNotLeadTag, inDateRange, normalizeEmail, normalizePhone, normalizeText, toNumber } from "./domain.js";
import { applyJobOverride } from "./jobOverrides.js";

export function normalizeSpendRows(rows, { startDate, endDate, timeZone } = {}) {
  let currentVendor = "";
  return rows
    .map((row) => {
      const vendorCandidate = normalizeText(row.Vendor ?? row.Name ?? row.vendor ?? row[""]);
      const totalRow = /^total for /i.test(vendorCandidate);
      if (vendorCandidate && !totalRow && !row["Transaction date"] && !row.Date) currentVendor = vendorCandidate;

      const date = row.Date ?? row["Transaction date"] ?? row.date ?? "";
      const amount = toNumber(row["Spend"] ?? row["Spend ($)"] ?? row.Amount ?? row.amount ?? row.spend);
      const vendor = normalizeText(row.Vendor ?? row.Name ?? row.vendor ?? currentVendor);
      const channel = normalizeText(row.Channel ?? row.Category ?? row["Distribution account"] ?? row.channel ?? "");
      const campaign = normalizeText(row.Campaign ?? row.campaign ?? row.Description ?? row["Description / Memo"] ?? "");

      return {
        date,
        vendor,
        channel,
        campaign,
        spend: amount,
        notes: normalizeText(row.Notes ?? row.notes ?? row.Description ?? row["Description / Memo"] ?? ""),
        sourceFile: normalizeText(row.sourceFile ?? row["Source File"] ?? ""),
        leads: toNumber(row.Leads ?? row.leads),
        trackable: !/untrack|organic|referral/i.test(`${vendor} ${channel} ${campaign}`),
      };
    })
    .filter((row) => row.spend !== 0 && row.vendor && (!startDate || inDateRange(row.date, startDate, endDate, timeZone)));
}

export function normalizeWindsorContacts(rows, { startDate, endDate, rules } = {}) {
  const timeZone = rules?.timezone;
  return rows
    .filter((row) => row.contact_id || row.id)
    .map((row) => ({
      id: normalizeText(row.contact_id ?? row.id),
      name: normalizeText(row.contact_name ?? row.name ?? row.contactName ?? row.fullName),
      email: normalizeEmail(row.contact_email ?? row.email),
      phone: normalizePhone(row.contact_phone ?? row.phone),
      source: normalizeText(row.contact_source ?? row.contact_lead_source ?? row.source),
      campaign: normalizeText(row.contact_utm_campaign ?? row.contact_source_campaign ?? row.campaign),
      createdDate: row.contact_date_added ?? row.createdDate ?? row.date,
      tags: row.contact_tags ?? row.tags ?? "",
      notesSummary: normalizeText(row.notesSummary ?? row.conversation_last_message_body ?? ""),
      rawRef: row.contact_id ?? row.id,
    }))
    .filter((lead) => lead.createdDate && (!startDate || inDateRange(lead.createdDate, startDate, endDate, timeZone)))
    .filter((lead) => !hasNotLeadTag(lead.tags, rules));
}

export function normalizeJobTreadJobs(rows, { startDate, endDate, rules } = {}) {
  const timeZone = rules?.timezone;
  return rows
    .map((row) => {
      const baseJob = applyJobOverride({
        id: normalizeText(row.jobNumber ?? row.number ?? row.jobId ?? row["Job #"] ?? row.id),
        jobNumber: normalizeText(row.jobNumber ?? row.number ?? row["Job #"] ?? row.id),
        jobId: normalizeText(row.jobId ?? row.rawId ?? row.id),
        rawId: normalizeText(row.jobId ?? row.id),
        customer: normalizeText(row.customer ?? row["Customer Name"] ?? row.name),
        email: normalizeEmail(row.email ?? row.customerEmail),
        phone: normalizePhone(row.phone ?? row.customerPhone),
        appointmentDate: row.appointmentDate ?? row.createdAt ?? row.date,
        soldDate: row.soldDate ?? null,
        jobSoldDate: row.jobSoldDate ?? row["Sold Date"] ?? row.soldDate ?? null,
        approvedOrderSoldDate: row.approvedOrderSoldDate ?? null,
        status: normalizeText(row.status ?? row.jobStatus),
        projectType: normalizeText(row.projectType ?? row.jobType ?? row["Job Type/Category"] ?? row["Project Type"] ?? row.category),
        revenue: toNumber(row.revenue ?? row["Revenue ($)"] ?? row["Contract Value ($)"] ?? row.contractAmount ?? row.soldPrice),
        netSales: toNumber(row.netSales ?? row.revenue ?? row["Revenue ($)"] ?? row["Contract Value ($)"]),
        customFields: row.customFields ?? row.custom_fields ?? {},
        accountFields: row.accountFields ?? row.account_fields ?? {},
        customFieldRevenue: toNumber(row.customFieldRevenue ?? row.custom_field_revenue),
        accountFieldRevenue: toNumber(row.accountFieldRevenue ?? row.account_field_revenue),
        resolvedRevenueField: normalizeText(row.resolvedRevenueField ?? row.resolved_revenue_field),
        designConsultant: normalizeText(row.designConsultant ?? row.estimator ?? row["Design Consultant"]),
        projectManager: normalizeText(row.projectManager ?? row["Project Manager"]),
        source: normalizeText(row.source ?? row["GHL Verified Source"] ?? ""),
        campaign: normalizeText(row.campaign ?? ""),
        notesSummary: normalizeText(row.notesSummary ?? row.appointmentNotesSummary ?? row.jobNotesSummary ?? ""),
        soldDateSource: normalizeText(row.soldDateSource ?? ""),
        rawRef: row.jobId ?? row["Job #"] ?? row.id,
      });

      const configuredSoldDate = resolveConfiguredSoldDate(baseJob, rules);
      const configuredRevenue = resolveConfiguredRevenue(baseJob, rules);
      return {
        ...baseJob,
        soldDate: configuredSoldDate.value,
        soldDateSource: configuredSoldDate.source,
        revenue: configuredRevenue.value,
        netSales: configuredRevenue.value,
        resolvedRevenueField: configuredRevenue.source,
        cancelled: matchesCancelled(baseJob, rules),
      };
    })
    .map((job) => ({
      ...job,
      inReportAppointment: startDate ? Boolean(job.appointmentDate && inDateRange(job.appointmentDate, startDate, endDate, timeZone)) : true,
      inReportSold: startDate
        ? Boolean(job.soldDate && !job.cancelled && inDateRange(job.soldDate, startDate, endDate, timeZone))
        : Boolean(job.soldDate && !job.cancelled),
    }))
    .filter((job) => {
      if (!job.id) return false;
      if (!startDate) return true;
      if (!job.appointmentDate && !job.soldDate) return true;
      return job.inReportAppointment || job.inReportSold;
    });
}

function resolveConfiguredSoldDate(job, rules) {
  const candidates = {
    soldDate: job.soldDate,
    jobSoldDate: job.jobSoldDate,
    approvedOrderSoldDate: job.approvedOrderSoldDate,
    "Sold Date": job.jobSoldDate,
  };
  const configuredFields = rules?.classification?.soldJob?.soldDateFields ?? ["soldDate"];

  for (const fieldName of configuredFields) {
    const value = candidates[fieldName];
    if (value) {
      return {
        value,
        source: fieldName === "soldDate" ? job.soldDateSource || fieldName : fieldName,
      };
    }
  }

  return { value: null, source: null };
}

function matchesCancelled(job, rules) {
  const pattern = rules?.classification?.soldJob?.cancelledPattern ?? "cancel";
  if (!pattern) return false;
  return new RegExp(pattern, "i").test(String(job.status ?? ""));
}

function resolveConfiguredRevenue(job, rules) {
  const configuredFields = rules?.classification?.soldJob?.revenueFields ?? [];
  const jobFields = job.customFields ?? rowObject(job.custom_fields);
  const accountFields = job.accountFields ?? rowObject(job.account_fields);
  const candidates = {
    revenue: toNumber(job.revenue),
    netSales: toNumber(job.netSales),
    customFieldRevenue: toNumber(job.customFieldRevenue),
    accountFieldRevenue: toNumber(job.accountFieldRevenue),
  };

  for (const fieldName of configuredFields) {
    const normalizedField = String(fieldName ?? "").trim();
    if (!normalizedField) continue;

    if (normalizedField in candidates) {
      const numericValue = toNumber(candidates[normalizedField]);
      if (numericValue > 0) {
        return { value: numericValue, source: normalizedField };
      }
    }

    const directJobValue = toNumber(jobFields[normalizedField]);
    if (directJobValue > 0) {
      return { value: directJobValue, source: normalizedField };
    }

    const directAccountValue = toNumber(accountFields[normalizedField]);
    if (directAccountValue > 0) {
      return { value: directAccountValue, source: normalizedField };
    }
  }

  return { value: 0, source: null };
}

function rowObject(value) {
  return value && typeof value === "object" ? value : {};
}
