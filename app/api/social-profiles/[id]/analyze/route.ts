import { NextResponse } from "next/server";
import { buildProfileMetricsCache } from "@/lib/social-profiles";
import { requireWorkspaceAccess } from "@/lib/server/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const workspaceId = String(body.workspaceId ?? "").trim();
    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });

    const { serviceSupabase } = await requireWorkspaceAccess(request, workspaceId);
    const { data: profile, error: profileError } = await serviceSupabase
      .from("social_profiles")
      .select("*")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

    const now = new Date().toISOString();
    const { data, error } = await serviceSupabase
      .from("social_profiles")
      .update({
        last_analyzed_at: now,
        updated_at: now,
        latest_cached_metrics: buildProfileMetricsCache({
          platform: profile.platform,
          profileUrl: profile.profile_url,
          username: profile.username,
          displayName: profile.display_name,
          businessProfileLabel: profile.business_profile_label,
          latestCachedMetrics: profile.latest_cached_metrics ?? null,
        }),
      })
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ profile: data });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not analyze social profile." }, { status });
  }
}
