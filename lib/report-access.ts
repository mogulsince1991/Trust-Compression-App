export const REPORT_UPGRADE_MESSAGE = "Purchase an agency plan to enable reporting.";
// Temporary launch entitlement. Match the workspace ID, never its editable name.
export function reportsEnabled(workspaceId?: string | null) {
  return workspaceId === "bef4c5ad-5ead-4f2a-934c-f1238f614589";
}
