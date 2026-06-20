import { normalizeJobTreadJobs, normalizeSpendRows, normalizeWindsorContacts } from "./normalize.js";

export async function ingestContractorSnapshot(supabase, input) {
  const workspaceId = String(input.workspaceId ?? "").trim();
  const provider = String(input.provider ?? "").trim();
  const displayName = String(input.displayName ?? getProviderDisplayName(provider)).trim();
  const externalAccountId = String(input.externalAccountId ?? "").trim();
  const connectedAccountId = String(input.connectedAccountId ?? "").trim() || null;
  const createdBy = String(input.createdBy ?? "").trim() || null;
  const settings = input.settings && typeof input.settings === "object" ? input.settings : {};

  if (!workspaceId) throw new Error("workspaceId is required for contractor ingest.");
  if (!provider) throw new Error("provider is required for contractor ingest.");
  if (!externalAccountId) throw new Error("externalAccountId is required for contractor ingest.");

  const sourceKey = `${provider}:${externalAccountId}`;
  const importedAt = new Date().toISOString();

  const canonical = {
    sourceKey,
    provider,
    displayName,
    externalAccountId,
    connectedAccountId,
    createdBy,
    settings,
    importedAt,
  };

  const normalized = {
    leads: normalizeWindsorContacts(Array.isArray(input.leads) ? input.leads : []),
    jobs: normalizeJobTreadJobs(Array.isArray(input.jobs) ? input.jobs : []),
    spendRows: normalizeSpendRows(Array.isArray(input.spendRows) ? input.spendRows : []),
  };

  const summary = { imported: 0, updated: 0, skipped: 0 };

  const ingestGroups = [
    { type: "lead", rows: normalized.leads },
    { type: "job", rows: normalized.jobs },
    { type: "spend", rows: normalized.spendRows },
  ];

  for (const group of ingestGroups) {
    for (const row of group.rows) {
      const recordId = resolveRecordId(group.type, row);
      if (!recordId) {
        summary.skipped += 1;
        continue;
      }

      const payload = {
        workspace_id: workspaceId,
        source_key: sourceKey,
        provider,
        record_type: group.type,
        record_id: recordId,
        display_name: displayName,
        external_account_id: externalAccountId,
        connected_account_id: connectedAccountId,
        settings,
        canonical,
        normalized: row,
        last_ingested_at: importedAt,
        created_by: createdBy,
      };

      const { data: existing, error: existingError } = await supabase
        .from("contractor_data_sources")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("source_key", sourceKey)
        .eq("record_type", group.type)
        .eq("record_id", recordId)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing?.id) {
        const { error } = await supabase
          .from("contractor_data_sources")
          .update(payload)
          .eq("id", existing.id);

        if (error) throw error;
        summary.updated += 1;
      } else {
        const { error } = await supabase.from("contractor_data_sources").insert(payload);
        if (error) throw error;
        summary.imported += 1;
      }
    }
  }

  return summary;
}

function resolveRecordId(type, row) {
  if (type === "lead") return firstString(row.id, row.contactId, row.email, row.phone);
  if (type === "job") return firstString(row.id, row.jobId, row.jobNumber, row.customer);
  if (type === "spend") return firstString(row.id, row.campaign, row.source, row.date);
  return null;
}

function firstString(...values) {
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
    if (normalized) return normalized;
  }
  return null;
}

function getProviderDisplayName(provider) {
  if (provider === "gohighlevel") return "GoHighLevel";
  if (provider === "jobtread") return "JobTread";
  if (provider === "spend_upload") return "Spend upload";
  return provider || "Contractor data source";
}
