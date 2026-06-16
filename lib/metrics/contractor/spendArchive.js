import fs from "node:fs";
import path from "node:path";
import { inDateRange } from "./domain.js";

const archivePath = path.join(process.cwd(), "data", "marketing-spend", "marketing-spend-archive.json");

export function loadArchivedSpendRows({ startDate, endDate } = {}) {
  if (!fs.existsSync(archivePath)) {
    return { rows: [], sources: [], warnings: ["Historic spend archive has not been imported yet."] };
  }

  const archive = JSON.parse(fs.readFileSync(archivePath, "utf8"));
  const rows = (archive.rows ?? []).filter((row) => !startDate || inDateRange(row.date, startDate, endDate));
  const monthsInRange = monthKeysInRange(startDate, endDate);
  const missingMonths = (archive.missingMonths ?? []).filter((month) => monthsInRange.includes(month));
  const coveredMonths = [...new Set(rows.map((row) => String(row.date).slice(0, 7)))].sort();
  const sources = (archive.sources ?? []).filter((source) => (source.months ?? []).some((month) => coveredMonths.includes(month)));
  const warnings = missingMonths.map((month) => `Marketing spend archive does not include ${month}.`);

  return {
    rows,
    sources,
    warnings,
    archivePath,
    generatedAt: archive.generatedAt,
  };
}

function monthKeysInRange(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const months = [];
  const cursor = new Date(`${startDate.slice(0, 7)}-01T00:00:00`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00`);
  while (cursor <= end) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}
