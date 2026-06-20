import { isSoldJob, safeDivide, safeDivideOrNull } from "./domain.js";
import { analyzeClosingOutcomes } from "./outcomes.js";
import { matchesVendor, sourceBucket } from "./attribution.js";
import { averageTimeToCloseLabel, easternDateTime, timeToClose, timeToCloseDays } from "./timeToClose.js";

function sum(rows, selector) {
  return rows.reduce((total, row) => total + selector(row), 0);
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row) || "Unassigned";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function spendFor(spendRows, predicate) {
  return sum(spendRows.filter(predicate), (row) => row.spend);
}

function average(rows, selector) {
  const values = rows.map(selector).filter((value) => value != null && Number.isFinite(value));
  return values.length ? sum(values, (value) => value) / values.length : null;
}

export function calculateReportMetrics({ spendRows, leads, jobs, matches, attributionMatches = matches, rules }) {
  const appointmentJobs = jobs.filter((job) => job.inReportAppointment !== false);
  const soldJobs = jobs.filter((job) => isSoldJob(job, rules) && job.inReportSold !== false);
  const matchedJobs = new Map(attributionMatches.map((match) => [match.job.id, match]));
  const attributionForJob = (job) => {
    const match = matchedJobs.get(job.id);
    return {
      ...job,
      source: match?.lead?.source || job.source,
      campaign: match?.lead?.campaign || job.campaign,
      lead: match?.lead,
    };
  };
  const attributedAppointmentJobs = appointmentJobs.map(attributionForJob);
  const attributedSoldJobs = soldJobs.map(attributionForJob);
  const paidLeads = leads.filter((lead) => sourceBucket(lead, rules) === "paid");
  const organicLeads = leads.filter((lead) => sourceBucket(lead, rules) !== "paid");
  const paidAppointmentJobs = attributedAppointmentJobs.filter((job) => sourceBucket(job, rules) === "paid");
  const organicAppointmentJobs = attributedAppointmentJobs.filter((job) => sourceBucket(job, rules) !== "paid");
  const paidSoldJobs = attributedSoldJobs.filter((job) => sourceBucket(job, rules) === "paid");
  const organicSoldJobs = attributedSoldJobs.filter((job) => sourceBucket(job, rules) !== "paid");
  const revenue = sum(soldJobs, (job) => job.revenue);
  const paidRevenue = sum(paidSoldJobs, (job) => job.revenue);
  const organicRevenue = revenue - paidRevenue;
  const netSales = sum(soldJobs, (job) => job.netSales || job.revenue);
  const totalSpend = sum(spendRows, (row) => row.spend);
  const spendProvided = spendRows.length > 0;
  const issuedLeads = appointmentJobs.length;

  const byVendor = [...groupBy(spendRows, (row) => row.vendor).entries()].map(([vendor, rows]) => {
    const vendorSpend = sum(rows, (row) => row.spend);
    const vendorLeads = leads.filter((lead) => matchesVendor(vendor, lead, rules));
    const vendorJobs = attributedAppointmentJobs.filter((job) => matchesVendor(vendor, job, rules));
    const vendorSold = attributedSoldJobs.filter((job) => matchesVendor(vendor, job, rules));
    const vendorRevenue = sum(vendorSold, (job) => job.revenue);
    return kpiRow(vendor, vendorSpend, vendorLeads.length || sum(rows, (row) => row.leads), vendorJobs.length, vendorSold.length, vendorRevenue);
  });

  const byCampaign = [...groupBy(spendRows, (row) => row.campaign || row.vendor).entries()].map(([campaign, rows]) => {
    const campaignSpend = sum(rows, (row) => row.spend);
    const campaignMatches = matches.filter(({ lead }) => rows.some((row) => row.campaign && row.campaign === lead.campaign));
    const campaignJobs = campaignMatches.map((match) => match.job);
    const campaignSold = campaignJobs.filter((job) => isSoldJob(job, rules));
    return kpiRow(campaign, campaignSpend, campaignMatches.length, campaignJobs.length, campaignSold.length, sum(campaignSold, (job) => job.revenue));
  });

  const consultantKeys = new Set([
    ...appointmentJobs.map((job) => job.designConsultant || "Unassigned"),
    ...soldJobs.map((job) => job.designConsultant || "Unassigned"),
  ]);
  const byDesignConsultant = [...consultantKeys].map((consultant) => {
    const consultantJobs = appointmentJobs.filter((job) => (job.designConsultant || "Unassigned") === consultant);
    const consultantSold = soldJobs.filter((job) => (job.designConsultant || "Unassigned") === consultant);
    const consultantRevenue = sum(consultantSold, (job) => job.revenue);
    return {
      designConsultant: consultant,
      appointments: consultantJobs.length,
      soldJobs: consultantSold.length,
      revenue: consultantRevenue,
      closeRate: safeDivide(consultantSold.length, consultantJobs.length),
      averageJobSize: safeDivide(consultantRevenue, consultantSold.length),
      revenuePerAppointment: safeDivide(consultantRevenue, consultantJobs.length),
      netSalesPerLeadIssued: safeDivide(sum(consultantSold, (job) => job.netSales || job.revenue), consultantJobs.length),
    };
  });

  const sourceKeys = new Set([
    ...leads.map((lead) => lead.source || lead.campaign || "Unassigned"),
    ...attributedAppointmentJobs.map((job) => job.source || job.campaign || "Unassigned"),
    ...attributedSoldJobs.map((job) => job.source || job.campaign || "Unassigned"),
  ]);
  const byLeadSource = [...sourceKeys].map((source) => {
    const sourceLeads = leads.filter((lead) => (lead.source || lead.campaign || "Unassigned") === source);
    const sourceJobs = attributedAppointmentJobs.filter((job) => (job.source || job.campaign || "Unassigned") === source);
    const sourceSold = attributedSoldJobs.filter((job) => (job.source || job.campaign || "Unassigned") === source);
    const sourceRevenue = sum(sourceSold, (job) => job.revenue);
    return {
      source,
      leads: sourceLeads.length,
      issuedLeads: sourceJobs.length,
      soldJobs: sourceSold.length,
      revenue: sourceRevenue,
      closeRate: safeDivide(sourceSold.length, sourceJobs.length),
      netSalesPerLeadIssued: safeDivide(sum(sourceSold, (job) => job.netSales || job.revenue), sourceJobs.length),
    };
  });

  return {
    totals: {
      spend: totalSpend,
      leads: leads.length,
      paidLeads: paidLeads.length,
      organicLeads: organicLeads.length,
      issuedLeads,
      paidIssuedLeads: paidAppointmentJobs.length,
      organicIssuedLeads: organicAppointmentJobs.length,
      soldJobs: soldJobs.length,
      paidSoldJobs: paidSoldJobs.length,
      organicSoldJobs: organicSoldJobs.length,
      revenue,
      paidRevenue,
      organicRevenue,
      unattributedRevenue: 0,
      netSales,
      spendProvided,
      costPerLead: spendProvided ? safeDivideOrNull(totalSpend, paidLeads.length) : null,
      costPerIssuedLead: spendProvided ? safeDivideOrNull(totalSpend, paidAppointmentJobs.length) : null,
      netSalesPerLeadIssued: safeDivide(netSales, issuedLeads),
      paidNetSalesPerLeadIssued: safeDivide(paidRevenue, paidAppointmentJobs.length),
      organicNetSalesPerLeadIssued: safeDivide(organicRevenue, organicAppointmentJobs.length),
      roas: spendProvided ? safeDivideOrNull(paidRevenue, totalSpend) : null,
      closeRate: safeDivide(soldJobs.length, issuedLeads),
      paidCloseRate: safeDivide(paidSoldJobs.length, paidAppointmentJobs.length),
      organicCloseRate: safeDivide(organicSoldJobs.length, organicAppointmentJobs.length),
      averageJobSize: safeDivide(revenue, soldJobs.length),
      paidAverageJobSize: safeDivide(paidRevenue, paidSoldJobs.length),
      organicAverageJobSize: safeDivide(organicRevenue, organicSoldJobs.length),
      averageTimeToCloseDays: average(attributedSoldJobs, (job) => timeToCloseDays({ leadCreatedDate: job.lead?.createdDate, soldDate: job.soldDate })),
      paidAverageTimeToCloseDays: average(paidSoldJobs, (job) => timeToCloseDays({ leadCreatedDate: job.lead?.createdDate, soldDate: job.soldDate })),
      organicAverageTimeToCloseDays: average(organicSoldJobs, (job) => timeToCloseDays({ leadCreatedDate: job.lead?.createdDate, soldDate: job.soldDate })),
      averageTimeToClose: averageTimeToCloseLabel(average(attributedSoldJobs, (job) => timeToCloseDays({ leadCreatedDate: job.lead?.createdDate, soldDate: job.soldDate }))),
      paidAverageTimeToClose: averageTimeToCloseLabel(average(paidSoldJobs, (job) => timeToCloseDays({ leadCreatedDate: job.lead?.createdDate, soldDate: job.soldDate }))),
      organicAverageTimeToClose: averageTimeToCloseLabel(average(organicSoldJobs, (job) => timeToCloseDays({ leadCreatedDate: job.lead?.createdDate, soldDate: job.soldDate }))),
    },
    spend: {
      trackable: spendFor(spendRows, (row) => row.trackable),
      untrackable: spendFor(spendRows, (row) => !row.trackable),
    },
    byVendor,
    byCampaign,
    byDesignConsultant,
    byLeadSource,
    closingOutcomes: analyzeClosingOutcomes(appointmentJobs, rules),
    jobsSoldDetail: soldJobs.map((job) => ({
      ...(() => {
        const attributed = attributionForJob(job);
        return {
          attributedSource: attributed.source,
          sourceBucket: sourceBucket(attributed, rules),
          leadCreatedDate: attributed.lead?.createdDate ?? "",
          leadCreatedEastern: easternDateTime(attributed.lead?.createdDate, rules),
          timeToClose: timeToClose({ leadCreatedDate: attributed.lead?.createdDate, soldDate: job.soldDate }),
        };
      })(),
      jobId: job.id,
      customer: job.customer,
      soldDate: job.soldDate,
      status: job.status,
      projectType: job.projectType,
      source: job.source,
      campaign: job.campaign,
      designConsultant: job.designConsultant,
      projectManager: job.projectManager,
      overrideReason: job.overrideReason,
      revenue: job.revenue,
      netSales: job.netSales || job.revenue,
      notesSummary: job.notesSummary,
    })),
  };
}

function kpiRow(name, spend, leads, issuedLeads, soldJobs, revenue) {
  const spendProvided = spend > 0;
  return {
    name,
    spend,
    leads,
    issuedLeads,
    soldJobs,
    revenue,
    costPerLead: spendProvided ? safeDivideOrNull(spend, leads) : null,
    costPerIssuedLead: spendProvided ? safeDivideOrNull(spend, issuedLeads) : null,
    costPerSoldJob: spendProvided ? safeDivideOrNull(spend, soldJobs) : null,
    roas: spendProvided ? safeDivideOrNull(revenue, spend) : null,
    closeRate: safeDivide(soldJobs, issuedLeads),
  };
}
