import type { User } from "@supabase/supabase-js";
import { createServiceSupabaseClient, createUserSupabaseClient } from "@/lib/supabase";
import { httpError } from "@/lib/server/route-auth";

export type PlatformAdminContext = {
  user: User;
  role: "super_admin" | "support_admin";
  serviceSupabase: NonNullable<ReturnType<typeof createServiceSupabaseClient>>;
};

export async function requirePlatformAdmin(request: Request): Promise<PlatformAdminContext> {
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) throw httpError(401, "Sign in before opening platform activity.");

  const userSupabase = createUserSupabaseClient(accessToken);
  const { data: { user }, error } = await userSupabase.auth.getUser();
  if (error || !user) throw httpError(401, "Your session expired. Sign in again.");

  const serviceSupabase = createServiceSupabaseClient();
  if (!serviceSupabase) throw httpError(500, "SUPABASE_SERVICE_ROLE_KEY is not configured.");

  const { data: admin, error: adminError } = await serviceSupabase
    .from("platform_admins")
    .select("role,active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError) throw httpError(500, adminError.message);
  if (!admin?.active || !["super_admin", "support_admin"].includes(admin.role)) {
    throw httpError(403, "Platform administrator access is required.");
  }

  return { user, role: admin.role, serviceSupabase };
}
