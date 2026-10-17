const escape = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const label = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");

export function reportPrintHtml(report: any) {
  const sections = report.ruleSet?.settings?.dashboardSections;
  const visibleSections = Array.isArray(sections) ? sections.filter((section: any) => section.visible !== false) : null;
  const visibleMetrics = visibleSections ? new Set(visibleSections.flatMap((section: any) => section.kind === "metric_band" ? section.metricIds ?? [] : [])) : null;
  const money = (value: any) => Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const format = (value: any, type?: string) => type === "currency" ? money(value) : type === "percent" ? `${(Number(value || 0) * 100).toFixed(1)}%` : typeof value === "number" ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(value ?? "");
  const table = (title: string, rows: any[], keys: string[], id?: string) => !rows?.length || (id && visibleSections && !visibleSections.some((section: any) => section.tableId === id)) ? "" : `<section><h2>${escape(title)}</h2><table><thead><tr>${keys.map(key => `<th>${escape(label(key))}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${keys.map(key => `<td>${escape(format(row[key], /revenue|spend|amount/i.test(key) ? "currency" : undefined))}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`;
  const cards = (report.configuredMetrics ?? []).filter((metric: any) => metric.visible !== false && (!visibleMetrics || visibleMetrics.has(metric.id))).map((metric: any) => `<div class="metric"><span>${escape(metric.name || metric.label || metric.id)}</span><strong>${escape(format(metric.value, metric.displayType || metric.format))}</strong></div>`).join("");
  const sales = report.breakdowns?.totalSalesReport;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(report.clientName || "Sales report")} ${escape(report.startDate)} to ${escape(report.endDate)}</title><style>
    @page{size:A4 landscape;margin:16mm}*{box-sizing:border-box}body{font:12px/1.5 Arial,sans-serif;color:#272727;margin:28px}header{border-bottom:3px solid #5c946e;padding-bottom:16px;margin-bottom:24px}h1{font-size:27px;margin:0}h2{font-size:17px;margin:22px 0 10px}p{margin:6px 0}.muted{color:#666}.metrics{display:flex;flex-wrap:wrap;gap:12px}.metric{border:1px solid #ddd;padding:14px;min-width:160px;break-inside:avoid}.metric span,.metric strong{display:block}.metric strong{font-size:22px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{text-align:left;padding:7px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}th{background:#eff1f3}thead{display:table-header-group}tr{break-inside:avoid}h2{break-after:avoid}.actions{margin-bottom:24px}button{padding:12px 20px;cursor:pointer}@media print{body{margin:0}.actions{display:none}}
    </style></head><body><div class="actions"><button onclick="window.print()">Print / Save as PDF</button><p>Choose Save as PDF in your print dialog.</p></div><header><h1>${escape(report.clientName || "Sales report")}</h1><p>${escape(report.startDate)} to ${escape(report.endDate)}</p><p class="muted">Generated ${escape(report.createdAt ? new Date(report.createdAt).toLocaleString("en-US") : "")} · ${escape(report.ruleSet?.name || "Report")}</p></header>
    ${sales ? `<div class="metrics"><div class="metric"><span>Gross sales</span><strong>${money(sales.gross?.total)}</strong></div><div class="metric"><span>Net sales</span><strong>${money(sales.net?.total)}</strong></div></div>` : ""}
    <h2>Performance summary</h2><div class="metrics">${cards}</div>${(report.executiveSummary ?? []).map((line: string) => `<p>${escape(line)}</p>`).join("")}
    ${table("Paid channel performance", report.dashboard?.paidChannelPerformance, ["name", "spend", "leads", "issuedLeads", "soldJobs", "revenue", "roas"], "paid_channel_performance")}
    ${table("Consultant performance", report.dashboard?.designConsultantPerformance, ["designConsultant", "appointments", "soldJobs", "revenue"], "design_consultant_performance")}
    ${table("Lead sources", report.dashboard?.leadsBySource, ["source", "leads", "issuedLeads", "soldJobs", "revenue"], "leads_by_source")}
    ${table("Sales detail", sales?.rows, ["documentNumber", "customerName", "approvalDate", "amount", "jobStatus", "consultant", "source"])}
    <footer><p class="muted">Saved report snapshot. Later CRM changes are not reflected until a new report is generated.</p></footer></body></html>`;
}

export function printReport(report: any) {
  const windowRef = window.open("", "_blank");
  if (!windowRef) throw new Error("Allow pop-ups to open the PDF export.");
  windowRef.opener = null;
  windowRef.document.write(reportPrintHtml(report));
  windowRef.document.close();
}
