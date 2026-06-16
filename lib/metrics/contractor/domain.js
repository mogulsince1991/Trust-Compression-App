import { METRIC_RULE_DEFINITIONS } from "./metricRules.js";

export const SOLD_STATUSES = new Set(METRIC_RULE_DEFINITIONS.classification.soldJob.statuses);

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function normalizeText(value) {
  return String(value ?? "").trim();
}

export function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "").replace(/[$,%(),]/g, "").trim();
  if (!cleaned || cleaned === "-") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function inDateRange(dateValue, startDate, endDate) {
  if (!dateValue) return false;
  const date = parseLocalDate(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const start = parseLocalDate(`${startDate}T00:00:00`);
  const end = parseLocalDate(`${endDate}T23:59:59`);
  return date >= start && date <= end;
}

function parseLocalDate(value) {
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T00:00:00`);
  }
  return new Date(text);
}

export function hasNotLeadTag(tags) {
  const text = Array.isArray(tags) ? tags.join(" ") : String(tags ?? "");
  const normalized = text.toLowerCase();
  return METRIC_RULE_DEFINITIONS.globalFilters.excludedLeadTagPhrases.some((phrase) => normalized.includes(phrase));
}

export function isSoldJob(job) {
  if (job.cancelled) return false;
  if (job.soldDate) return true;
  return SOLD_STATUSES.has(String(job.status ?? "").trim().toLowerCase());
}

export function safeDivide(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

export function safeDivideOrNull(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}
