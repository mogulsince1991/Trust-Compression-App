import { buildReport } from "./report.js";

export function buildReportFromDatabaseRows({ client, startDate, endDate, leads = [], jobs = [], spendRows = [] }) {
  return buildReport({
    client,
    startDate,
    endDate,
    uploadedSpendRows: spendRows.map((row) => ({
      Date: row.spend_date,
      Vendor: row.vendor,
      Channel: row.channel,
      Campaign: row.campaign,
      Spend: row.spend,
      Leads: row.leads,
      trackable: row.trackable,
      sourceFile: row.source_file,
    })),
    windsorRows: leads.map((row) => ({
      id: row.external_id || row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      source: row.source,
      campaign: row.campaign,
      createdDate: row.created_date,
      tags: Array.isArray(row.tags) ? row.tags.join(",") : row.tags,
      notesSummary: row.notes_summary,
    })),
    jobtreadRows: jobs.map((row) => ({
      id: row.external_id || row.id,
      jobId: row.external_id || row.id,
      jobNumber: row.job_number,
      customer: row.customer,
      email: row.email,
      phone: row.phone,
      appointmentDate: row.appointment_date,
      soldDate: row.sold_date,
      status: row.status,
      projectType: row.project_type,
      revenue: row.revenue,
      netSales: row.net_sales,
      designConsultant: row.design_consultant,
      projectManager: row.project_manager,
      source: row.source,
      campaign: row.campaign,
      notesSummary: row.notes_summary,
    })),
  });
}

export function reportBreakdowns(metrics) {
  return {
    spend: metrics.spend,
    byVendor: metrics.byVendor,
    byCampaign: metrics.byCampaign,
    byDesignConsultant: metrics.byDesignConsultant,
    byLeadSource: metrics.byLeadSource,
    closingOutcomes: metrics.closingOutcomes,
    jobsSoldDetail: metrics.jobsSoldDetail,
  };
}
