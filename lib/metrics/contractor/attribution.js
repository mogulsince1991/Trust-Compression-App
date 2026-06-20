import { compilePattern, METRIC_RULE_DEFINITIONS } from "./metricRules.js";

export function attributionText(record) {
  return [record.source, record.campaign, record.notes, record.notesSummary].filter(Boolean).join(" ");
}

export function sourceBucket(record, rules = METRIC_RULE_DEFINITIONS) {
  const text = attributionText(record);
  const paidSourcePatterns = getPaidSourcePatterns(rules);
  const organicSourcePatterns = getOrganicSourcePatterns(rules);
  if (paidSourcePatterns.some((pattern) => pattern.test(text))) return "paid";
  if (organicSourcePatterns.some((pattern) => pattern.test(text))) return "organic";
  return "unattributed";
}

export function matchesVendor(vendor, record, rules = METRIC_RULE_DEFINITIONS) {
  const vendorKey = normalizeKey(vendor);
  const text = normalizeKey(attributionText(record));
  const paidVendorAliases = getPaidVendorAliases(rules);
  const aliasRule = paidVendorAliases.find(
    (rule) => normalizeKey(rule.vendor) === vendorKey || rule.aliases.some((alias) => normalizeKey(alias) === vendorKey)
  );
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

function getPaidVendorAliases(rules = METRIC_RULE_DEFINITIONS) {
  return rules.classification?.paidVendorAliases ?? METRIC_RULE_DEFINITIONS.classification.paidVendorAliases;
}

function getPaidSourcePatterns(rules = METRIC_RULE_DEFINITIONS) {
  const patterns = rules.classification?.paidSourcePatterns ?? METRIC_RULE_DEFINITIONS.classification.paidSourcePatterns;
  return patterns.map((pattern) => compilePattern(pattern));
}

function getOrganicSourcePatterns(rules = METRIC_RULE_DEFINITIONS) {
  const patterns =
    rules.classification?.organicSourcePatterns ?? METRIC_RULE_DEFINITIONS.classification.organicSourcePatterns;
  return patterns.map((pattern) => compilePattern(pattern));
}
