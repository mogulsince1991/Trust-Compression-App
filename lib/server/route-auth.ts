import type { User } from "@supabase/supabase-js";
import { createServiceSupabaseClient, createUserSupabaseClient } from "@/lib/supabase";

export type WorkspaceAccessContext = {
  accessToken: string;
  user: User;
  workspaceRole: string;
  userSupabase: ReturnType<typeof createUserSupabaseClient>;
  serviceSupabase: NonNullable<ReturnType<typeof createServiceSupabaseClient>>;
};

export const workspaceManagerRoles = new Set(["owner", "admin"]);

export async function requireWorkspaceAccess(request: Request, workspaceId: string): Promise<WorkspaceAccessContext> {
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    throw httpError(401, "Sign in before accessing this workspace.");
  }

  const userSupabase = createUserSupabaseClient(accessToken);
  const {
    data: { user },
    error: userError,
  } = await userSupabase.auth.getUser();

  if (userError || !user) {
    throw httpError(401, "Your session expired. Sign in again.");
  }

  const serviceSupabase = createServiceSupabaseClient();
  if (!serviceSupabase) {
    throw httpError(500, "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  const { data: membership, error: membershipError } = await serviceSupabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    throw httpError(500, membershipError.message);
  }

  if (!membership?.role) {
    throw httpError(403, "You do not have access to this workspace.");
  }

  return {
    accessToken,
    user,
    workspaceRole: membership.role,
    userSupabase,
    serviceSupabase,
  };
}

export function requireWorkspaceManager(context: WorkspaceAccessContext) {
  if (!workspaceManagerRoles.has(context.workspaceRole)) {
    throw httpError(403, "Only workspace owners and admins can manage this workspace.");
  }
  return context;
}

export function httpError(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}
