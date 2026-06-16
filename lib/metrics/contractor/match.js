export function matchRecords(leads, jobs) {
  const leadByEmail = new Map();
  const leadByPhone = new Map();
  const leadsByName = new Map();

  for (const lead of leads) {
    if (lead.email && !leadByEmail.has(lead.email)) leadByEmail.set(lead.email, lead);
    if (lead.phone && !leadByPhone.has(lead.phone)) leadByPhone.set(lead.phone, lead);
    for (const nameKey of normalizeNameKeys(lead.name)) {
      if (!leadsByName.has(nameKey)) leadsByName.set(nameKey, []);
      leadsByName.get(nameKey).push(lead);
    }
  }

  const matchedLeadIds = new Set();
  const matchedJobIds = new Set();
  const matched = [];

  for (const job of jobs) {
    const jobNameKeys = normalizeNameKeys(job.customer);
    const exactNameMatches = leadsByName.get(jobNameKeys[0]) ?? [];
    const nameMatches = exactNameMatches.length === 1 ? exactNameMatches : uniqueLeads(jobNameKeys.flatMap((key) => leadsByName.get(key) ?? []));
    const lead = (job.email && leadByEmail.get(job.email)) || (job.phone && leadByPhone.get(job.phone)) || (nameMatches.length === 1 ? nameMatches[0] : null);
    if (!lead) continue;
    matched.push({ lead, job, matchKey: job.email && job.email === lead.email ? "email" : job.phone && job.phone === lead.phone ? "phone" : "name" });
    matchedLeadIds.add(lead.id || `${lead.email}:${lead.phone}`);
    matchedJobIds.add(job.id);
  }

  return {
    matched,
    unmatchedLeads: leads.filter((lead) => !matchedLeadIds.has(lead.id || `${lead.email}:${lead.phone}`)),
    unmatchedJobs: jobs.filter((job) => !matchedJobIds.has(job.id)),
  };
}

function normalizeNameKeys(value) {
  const normalized = String(value ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized) return [];
  const keys = new Set([normalized]);
  const parts = normalized.split(/\s+/);
  const andIndex = parts.indexOf("and");
  if (andIndex > 0 && andIndex < parts.length - 2) {
    const lastName = parts[parts.length - 1];
    keys.add(`${parts[0]} ${lastName}`);
    keys.add(`${parts[andIndex + 1]} ${lastName}`);
  }
  return [...keys];
}

function uniqueLeads(leads) {
  const seen = new Set();
  return leads.filter((lead) => {
    const key = lead.id || `${lead.email}:${lead.phone}:${lead.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
