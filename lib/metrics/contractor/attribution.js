import { compilePattern, METRIC_RULE_DEFINITIONS } from "./metricRules.js";

const PAID_VENDOR_ALIASES = METRIC_RULE_DEFINITIONS.classification.paidVendorAliases;
const PAID_SOURCE_PATTERNS = METRIC_RULE_DEFINITIONS.classification.paidSourcePatterns.map((pattern) => compilePattern(pattern));
const ORGANIC_SOURCE_PATTERNS = METRIC_RULE_DEFINITIONS.classification.organicSourcePatterns.map((pattern) => compilePattern(pattern));

export function attributionText(record) {
  return [record.source, record.campaign, record.notes, record.notesSummary].filter(Boolean).join(" ");
}

export function sourceBucket(record) {
  const text = attributionText(record);
  if (PAID_SOURCE_PATTERNS.some((pattern) => pattern.test(text))) return "paid";
  if (ORGANIC_SOURCE_PATTERNS.some((pattern) => pattern.test(text))) return "organic";
  return "unattributed";
}

export function matchesVendor(vendor, record) {
  const vendorKey = normalizeKey(vendor);
  const text = normalizeKey(attributionText(record));
  const aliasRule = PAID_VENDOR_ALIASES.find((rule) => normalizeKey(rule.vendor) === vendorKey || rule.aliases.some((alias) => normalizeKey(alias) === vendorKey));
  const aliases = aliasRule ? aliasRule.aliases : [vendor];

  if (vendorKey === "google") {
    return /\bgoogle (ad|ads|lsa)\b/.test(text) || /\blocal service ads?\b/.test(text);
  }

  return aliases.some((alias) => {
    const aliasKey = normalizeKey(alias);
    return aliasKey && text.includes(aliasKey);
  });
}

function normalizeKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
