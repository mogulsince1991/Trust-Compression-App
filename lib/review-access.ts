export const REVIEW_ROLE = "tt_reviewer";
export const REVIEW_HOURS = 4;

export function isReviewUser(user: { role?: string; app_metadata?: Record<string, unknown> } | null | undefined) {
  return user?.role === REVIEW_ROLE || user?.app_metadata?.review_account === true;
}

// Default-deny: adding a new API route never implicitly expands reviewer access.
const readablePaths = new Set([
  "/api/workspaces", "/api/journeys", "/api/library-assets", "/api/archive",
  "/api/journey-contacts", "/api/social-profiles", "/api/tracking-links", "/api/review/status",
]);

export function reviewRequestAllowed(method: string, pathname: string, requestedWorkspace: string | null, workspaceId: string) {
  return method === "GET" && readablePaths.has(pathname) && (!requestedWorkspace || requestedWorkspace === workspaceId);
}

export function reviewGrantActive(grant: { user_id: string | null; expires_at: string; revoked_at: string | null } | null, userId: string, now = Date.now()) {
  return !!grant && grant.user_id === userId && !grant.revoked_at && Date.parse(grant.expires_at) > now;
}
