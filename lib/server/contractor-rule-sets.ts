import {
  CONTRACTOR_FIELD_CATALOG,
  buildFieldCatalog,
  createDefaultContractorRuleSet,
  normalizeStoredRuleSet,
  slugify,
  type ContractorRuleSetRecord,
} from "@/lib/metrics/contractor/config";

export async function ensureDefaultContractorRuleSet(serviceSupabase: any, workspaceId: string, userId?: string) {
  const { data: existing, error } = await serviceSupabase
    .from("contractor_metric_rule_sets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_default", true)
    .maybeSingle();

  if (error) throw error;
  if (existing) return normalizeStoredRuleSet(existing);

  const { data: fallbackRows, error: fallbackError } = await serviceSupabase
    .from("contractor_metric_rule_sets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (fallbackError) throw fallbackError;

  const fallback = fallbackRows?.[0] ?? null;
  if (fallback) {
    await serviceSupabase
      .from("contractor_metric_rule_sets")
      .update({ is_default: false, updated_by: userId ?? null })
      .eq("workspace_id", workspaceId)
      .eq("is_default", true);

    const { data: promoted, error: promoteError } = await serviceSupabase
      .from("contractor_metric_rule_sets")
      .update({ is_default: true, updated_by: userId ?? null })
      .eq("workspace_id", workspaceId)
      .eq("id", fallback.id)
      .select("*")
      .single();

    if (promoteError) throw promoteError;
    return normalizeStoredRuleSet(promoted);
  }

  const draft = createDefaultContractorRuleSet();
  const { data, error: insertError } = await serviceSupabase
    .from("contractor_metric_rule_sets")
    .insert(serializeRuleSet(workspaceId, draft, userId))
    .select("*")
    .single();

  if (insertError) {
    const { data: conflictedRows, error: conflictReadError } = await serviceSupabase
      .from("contractor_metric_rule_sets")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("slug", draft.slug)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (conflictReadError) throw conflictReadError;

    const conflicted = conflictedRows?.[0] ?? null;
    if (!conflicted) throw insertError;

    const { data: promoted, error: promoteError } = await serviceSupabase
      .from("contractor_metric_rule_sets")
      .update({ is_default: true, updated_by: userId ?? null })
      .eq("workspace_id", workspaceId)
      .eq("id", conflicted.id)
      .select("*")
      .single();

    if (promoteError) throw promoteError;
    return normalizeStoredRuleSet(promoted);
  }

  return normalizeStoredRuleSet(data);
}

export async function listContractorRuleSets(serviceSupabase: any, workspaceId: string) {
  const { data, error } = await serviceSupabase
    .from("contractor_metric_rule_sets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(normalizeStoredRuleSet);
}

export async function getContractorRuleSet(serviceSupabase: any, workspaceId: string, ruleSetId?: string | null) {
  if (!ruleSetId) {
    return ensureDefaultContractorRuleSet(serviceSupabase, workspaceId);
  }

  const { data, error } = await serviceSupabase
    .from("contractor_metric_rule_sets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", ruleSetId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return ensureDefaultContractorRuleSet(serviceSupabase, workspaceId);
  return normalizeStoredRuleSet(data);
}

export async function saveContractorRuleSet(
  serviceSupabase: any,
  workspaceId: string,
  ruleSet: Partial<ContractorRuleSetRecord>,
  userId?: string,
  ruleSetId?: string | null
) {
  const normalized = normalizeStoredRuleSet({
    ...ruleSet,
    id: ruleSetId ?? ruleSet.id,
    workspace_id: workspaceId,
    slug: slugify(ruleSet.slug || ruleSet.name || "contractor-rule-set"),
  });

  if (normalized.isDefault) {
    await serviceSupabase
      .from("contractor_metric_rule_sets")
      .update({ is_default: false })
      .eq("workspace_id", workspaceId);
  }

  if (ruleSetId) {
    const { data, error } = await serviceSupabase
      .from("contractor_metric_rule_sets")
      .update({
        ...serializeRuleSet(workspaceId, normalized, userId),
        updated_by: userId ?? null,
      })
      .eq("workspace_id", workspaceId)
      .eq("id", ruleSetId)
      .select("*")
      .single();
    if (error) throw error;
    return normalizeStoredRuleSet(data);
  }

  const { data, error } = await serviceSupabase
    .from("contractor_metric_rule_sets")
    .insert(serializeRuleSet(workspaceId, normalized, userId))
    .select("*")
    .single();
  if (error) throw error;
  return normalizeStoredRuleSet(data);
}

export function contractorMetricBuilderPayload(ruleSets: ContractorRuleSetRecord[], currentRuleSet?: ContractorRuleSetRecord | null) {
  const activeRuleSet = currentRuleSet ?? ruleSets[0] ?? null;
  const datasets = activeRuleSet?.settings?.datasetDefinitions ?? [];
  return {
    fieldCatalog: datasets.length ? buildFieldCatalog(datasets) : CONTRACTOR_FIELD_CATALOG,
    datasetCatalog: datasets,
    ruleSets,
    currentRuleSet: activeRuleSet,
  };
}

function serializeRuleSet(workspaceId: string, ruleSet: ContractorRuleSetRecord, userId?: string) {
  return {
    workspace_id: workspaceId,
    name: ruleSet.name,
    slug: slugify(ruleSet.slug || ruleSet.name),
    version: ruleSet.version,
    description: ruleSet.description,
    is_default: ruleSet.isDefault,
    status: ruleSet.status,
    providers: ruleSet.providers,
    global_filters: ruleSet.globalFilters,
    classifications: ruleSet.classifications,
    metric_definitions: ruleSet.metricDefinitions,
    grouped_metric_sets: ruleSet.groupedMetricSets,
    settings: ruleSet.settings,
    created_by: userId ?? null,
    updated_by: userId ?? null,
  };
}
