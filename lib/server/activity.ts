import type { SupabaseClient } from "@supabase/supabase-js";

type ActivityInput = {
  workspaceId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  surface?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

const blockedMetadataKeys = /token|secret|password|authorization|email|phone|name|url|customer|contact/i;

export async function recordActivity(serviceSupabase: SupabaseClient, input: ActivityInput) {
  const metadata = Object.fromEntries(
    Object.entries(input.metadata ?? {}).filter(([key]) => !blockedMetadataKeys.test(key))
  );

  const { error } = await serviceSupabase.from("app_activity_events").insert({
    workspace_id: input.workspaceId ?? null,
    actor_user_id: input.actorUserId ?? null,
    event_type: input.eventType,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    surface: input.surface ?? null,
    metadata,
  });

  if (error) console.error("Activity event could not be recorded", error.message);
}
