import type { User } from "@supabase/supabase-js";
import type { createUserSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase";

export async function claimWorkspaceInvites(user: User, service: NonNullable<ReturnType<typeof createServiceSupabaseClient>>, client: ReturnType<typeof createUserSupabaseClient>) {
  if (!user.email || !user.email_confirmed_at || user.app_metadata?.review_account || user.role === "tt_reviewer") return;
  const { data: invites, error } = await service.from("workspace_invites")
    .select("token,workspace_id").eq("email", user.email.trim().toLowerCase())
    .eq("status", "pending").gt("expires_at", new Date().toISOString());
  if (error) throw new Error("Could not check your workspace invitations. Please try again.");
  for (const invite of invites ?? []) {
    const membership = await service.from("workspace_members").select("role")
      .eq("workspace_id", invite.workspace_id).eq("user_id", user.id).maybeSingle();
    if (membership.error) throw new Error("Could not check workspace access. Please try again.");
    // Invitations must never replace an existing member's role during sign-in.
    if (membership.data) continue;
    const result = await client.rpc("accept_workspace_invite", { invite_token: invite.token });
    if (result.error) {
      // Another tab may have claimed it while this request was in flight.
      const joined = await service.from("workspace_members").select("role")
        .eq("workspace_id", invite.workspace_id).eq("user_id", user.id).maybeSingle();
      if (!joined.data) throw new Error("An invitation could not be applied. Ask your workspace administrator to check its status, then sign in again.");
    }
  }
}
