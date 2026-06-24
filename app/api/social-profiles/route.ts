import { NextResponse } from "next/server";
import { buildProfileMetricsCache, normalizeSocialProfile } from "@/lib/social-profiles";
import { requireWorkspaceAccess } from "@/lib/server/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim() ?? "";
    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });

    const { serviceSupabase } = await requireWorkspaceAccess(request, workspaceId);
    const { data, error } = await serviceSupabase
      .from("social_profiles")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ profiles: data ?? [] });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load social profiles." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const workspaceId = String(body.workspaceId ?? "").trim();
    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });

    const normalized = normalizeSocialProfile({
      platform: String(body.platform ?? ""),
      profileUrl: String(body.profileUrl ?? ""),
      username: String(body.username ?? ""),
      displayName: String(body.displayName ?? ""),
      avatarUrl: String(body.avatarUrl ?? ""),
      businessProfileLabel: String(body.businessProfileLabel ?? ""),
    });
    const analyze = body.analyze !== false;

    const { user, serviceSupabase } = await requireWorkspaceAccess(request, workspaceId);

    const { data: existing, error: existingError } = await serviceSupabase
      .from("social_profiles")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("profile_key", normalized.profileKey)
      .maybeSingle();

    if (existingError) throw existingError;

    const payload = {
      workspace_id: workspaceId,
      user_id: user.id,
      business_profile_label: normalized.businessProfileLabel,
      platform: normalized.platform,
      username: normalized.username,
      profile_url: normalized.profileUrl,
      profile_key: normalized.profileKey,
      display_name: normalized.displayName,
      avatar_url: normalized.avatarUrl,
      last_analyzed_at: analyze ? new Date().toISOString() : existing?.last_analyzed_at ?? null,
      latest_cached_metrics: analyze
        ? buildProfileMetricsCache({
            platform: normalized.platform,
            profileUrl: normalized.profileUrl,
            username: normalized.username,
            displayName: normalized.displayName,
            businessProfileLabel: normalized.businessProfileLabel,
            latestCachedMetrics: existing?.latest_cached_metrics ?? null,
          })
        : existing?.latest_cached_metrics ?? {},
      updated_at: new Date().toISOString(),
    };

    const query = existing
      ? serviceSupabase.from("social_profiles").update(payload).eq("id", existing.id)
      : serviceSupabase.from("social_profiles").insert(payload);

    const { data, error } = await query.select("*").single();
    if (error) throw error;

    return NextResponse.json({
      profile: data,
      mode: existing ? "updated" : "created",
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save social profile." }, { status });
  }
}
