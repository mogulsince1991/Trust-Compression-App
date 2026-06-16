import { NextResponse } from "next/server";
import { buildReport } from "../../../../../lib/metrics/contractor/report.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const report = buildReport({
    client: "Smoke Test Contractor",
    startDate: "2026-06-01",
    endDate: "2026-06-30",
    uploadedSpendRows: [
      {
        Date: "2026-06-03",
        Vendor: "Google",
        Channel: "Paid Search",
        Campaign: "google ads - bathroom remodel",
        Spend: "1200",
        Leads: "2",
      },
      {
        Date: "2026-06-05",
        Vendor: "FaceBook",
        Channel: "Meta Ads",
        Campaign: "facebook ads - siding",
        Spend: "800",
        Leads: "1",
      },
    ],
    windsorRows: [
      {
        id: "lead-1",
        name: "Avery Johnson",
        email: "avery@example.com",
        phone: "555-0101",
        source: "Google Ads",
        campaign: "google ads - bathroom remodel",
        createdDate: "2026-06-04T10:30:00-04:00",
        tags: "qualified",
      },
      {
        id: "lead-2",
        name: "Morgan Smith",
        email: "morgan@example.com",
        phone: "555-0102",
        source: "Referral",
        campaign: "organic referral",
        createdDate: "2026-06-06T09:00:00-04:00",
        tags: "qualified",
      },
    ],
    jobtreadRows: [
      {
        jobNumber: "JT-1001",
        customer: "Avery Johnson",
        email: "avery@example.com",
        phone: "555-0101",
        appointmentDate: "2026-06-05T14:00:00-04:00",
        soldDate: "2026-06-08T11:00:00-04:00",
        status: "Sold",
        projectType: "Bathroom Remodel",
        revenue: "18000",
        netSales: "18000",
        designConsultant: "Taylor Consultant",
        source: "Google Ads",
        campaign: "google ads - bathroom remodel",
      },
      {
        jobNumber: "JT-1002",
        customer: "Morgan Smith",
        email: "morgan@example.com",
        phone: "555-0102",
        appointmentDate: "2026-06-09T13:00:00-04:00",
        status: "No Sale",
        projectType: "Windows",
        revenue: "0",
        designConsultant: "Taylor Consultant",
        source: "Referral",
        campaign: "organic referral",
        notesSummary: "Customer said price was too high and wanted to wait until next year.",
      },
    ],
  });

  return NextResponse.json({
    ok: true,
    phase: "contractor-metrics-phase-1",
    dataPolicy: "sample rows only; no customer cache, no credentials, no external API calls",
    totals: report.metrics.totals,
    byVendor: report.metrics.byVendor,
    byDesignConsultant: report.metrics.byDesignConsultant,
    closingOutcomes: report.metrics.closingOutcomes,
    executiveSummary: report.executiveSummary,
  });
}
