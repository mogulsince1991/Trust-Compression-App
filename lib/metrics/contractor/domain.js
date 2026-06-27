import { METRIC_RULE_DEFINITIONS } from "./metricRules.js";

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

export function inDateRange(dateValue, startDate, endDate, timeZone = METRIC_RULE_DEFINITIONS.timezone) {
  if (!dateValue) return false;
  const actual = dateKeyInTimeZone(dateValue, timeZone);
  if (!actual) return false;
  return actual >= startDate && actual <= endDate;
}

export function dateKeyInTimeZone(value, timeZone = METRIC_RULE_DEFINITIONS.timezone) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = formatterFor(timeZone);
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function hasNotLeadTag(tags) {
  const text = Array.isArray(tags) ? tags.join(" ") : String(tags ?? "");
  const normalized = text.toLowerCase();
  return getExcludedLeadTagPhrases().some((phrase) => normalized.includes(phrase));
}

export function isSoldJob(job, rules = METRIC_RULE_DEFINITIONS) {
  if (matchesCancelled(job, rules)) return false;
  return Boolean(job.soldDate);
}

export function safeDivide(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

export function safeDivideOrNull(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

function getExcludedLeadTagPhrases(rules = METRIC_RULE_DEFINITIONS) {
  return rules.globalFilters?.excludedLeadTagPhrases ?? METRIC_RULE_DEFINITIONS.globalFilters.excludedLeadTagPhrases;
}

function matchesCancelled(job, rules = METRIC_RULE_DEFINITIONS) {
  const cancelledPattern =
    rules.classification?.soldJob?.cancelledPattern ?? METRIC_RULE_DEFINITIONS.classification.soldJob.cancelledPattern;
  if (job.cancelled === true) return true;
  if (!cancelledPattern) return false;
  return new RegExp(cancelledPattern, "i").test(String(job.status ?? ""));
}

const formatterCache = new Map();

function formatterFor(timeZone) {
  const key = timeZone || METRIC_RULE_DEFINITIONS.timezone;
  if (!formatterCache.has(key)) {
    formatterCache.set(
      key,
      new Intl.DateTimeFormat("en-US", {
        timeZone: key,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    );
  }
  return formatterCache.get(key);
}
