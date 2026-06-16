import { hasNotLeadTag, inDateRange, normalizeEmail, normalizePhone, normalizeText, toNumber } from "./domain.js";
import { applyJobOverride } from "./jobOverrides.js";

export function normalizeSpendRows(rows, { startDate, endDate } = {}) {
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
    .filter((row) => row.spend !== 0 && row.vendor && (!startDate || inDateRange(row.date, startDate, endDate)));
}

export function normalizeWindsorContacts(rows, { startDate, endDate } = {}) {
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
    .filter((lead) => lead.createdDate && (!startDate || inDateRange(lead.createdDate, startDate, endDate)))
    .filter((lead) => !hasNotLeadTag(lead.tags));
}

export function normalizeJobTreadJobs(rows, { startDate, endDate } = {}) {
  return rows
    .map((row) => applyJobOverride({
      id: normalizeText(row.jobNumber ?? row.number ?? row.jobId ?? row["Job #"] ?? row.id),
      jobNumber: normalizeText(row.jobNumber ?? row.number ?? row["Job #"] ?? row.id),
      jobId: normalizeText(row.jobId ?? row.rawId ?? row.id),
      rawId: normalizeText(row.jobId ?? row.id),
      customer: normalizeText(row.customer ?? row["Customer Name"] ?? row.name),
      email: normalizeEmail(row.email ?? row.customerEmail),
      phone: normalizePhone(row.phone ?? row.customerPhone),
      appointmentDate: row.appointmentDate ?? row.createdAt ?? row.date,
      soldDate: row.soldDate ?? row["Sold Date"] ?? row.jobSoldDate,
      status: normalizeText(row.status ?? row.jobStatus),
      projectType: normalizeText(row.projectType ?? row.jobType ?? row["Job Type/Category"] ?? row["Project Type"] ?? row.category),
      cancelled: /cancel/i.test(String(row.status ?? row.jobStatus ?? "")),
      revenue: toNumber(row.revenue ?? row["Revenue ($)"] ?? row["Contract Value ($)"] ?? row.contractAmount ?? row.soldPrice),
      netSales: toNumber(row.netSales ?? row.revenue ?? row["Revenue ($)"] ?? row["Contract Value ($)"]),
      designConsultant: normalizeText(row.designConsultant ?? row.estimator ?? row["Design Consultant"]),
      projectManager: normalizeText(row.projectManager ?? row["Project Manager"]),
      source: normalizeText(row.source ?? row["GHL Verified Source"] ?? ""),
      campaign: normalizeText(row.campaign ?? ""),
      notesSummary: normalizeText(row.notesSummary ?? row.appointmentNotesSummary ?? row.jobNotesSummary ?? ""),
      rawRef: row.jobId ?? row["Job #"] ?? row.id,
    }))
    .map((job) => ({
      ...job,
      inReportAppointment: startDate ? Boolean(job.appointmentDate && inDateRange(job.appointmentDate, startDate, endDate)) : true,
      inReportSold: startDate ? Boolean(job.soldDate && inDateRange(job.soldDate, startDate, endDate)) : Boolean(job.soldDate),
    }))
    .filter((job) => {
      if (!job.id) return false;
      if (!startDate) return true;
      if (!job.appointmentDate && !job.soldDate) return true;
      return job.inReportAppointment || job.inReportSold;
    });
}
