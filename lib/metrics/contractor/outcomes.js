import { compilePattern, METRIC_RULE_DEFINITIONS } from "./metricRules.js";

export function analyzeClosingOutcomes(jobs, rules = METRIC_RULE_DEFINITIONS) {
  const unsold = jobs.filter((job) => !job.soldDate && !/^sold$/i.test(job.status ?? ""));
  const groups = new Map();
  const outcomeRules = getOutcomeRules(rules);

  for (const job of unsold) {
    const text = `${job.status ?? ""} ${job.notesSummary ?? ""}`.trim();
    const rule = outcomeRules.find((candidate) => candidate.pattern.test(text));
    const reason = rule?.reason ?? "Uncategorized / Needs Review";
    if (!groups.has(reason)) {
      groups.set(reason, {
        reason,
        jobs: 0,
        examples: [],
        description: rule?.description ?? "No deterministic rule matched the available notes.",
      });
    }
    const group = groups.get(reason);
    group.jobs += 1;
    if (group.examples.length < 3) {
      group.examples.push({
        jobId: job.id,
        customer: job.customer,
        designConsultant: job.designConsultant,
        notesSummary: compact(job.notesSummary),
      });
    }
  }

  return [...groups.values()].sort((a, b) => b.jobs - a.jobs || a.reason.localeCompare(b.reason));
}

function compact(text) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > 220 ? `${value.slice(0, 217)}...` : value;
}

function getOutcomeRules(rules = METRIC_RULE_DEFINITIONS) {
  return (rules.closingOutcomeRules ?? METRIC_RULE_DEFINITIONS.closingOutcomeRules).map((rule) => ({
    ...rule,
    pattern: compilePattern(rule.pattern),
  }));
}
