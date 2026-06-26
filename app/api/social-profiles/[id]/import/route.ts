import { NextResponse } from "next/server";
import { runSourceImport } from "@/lib/import-runner";
import { normalizeSocialProfile } from "@/lib/social-profiles";
import { parseSourceUrl } from "@/lib/source-import";
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
    const mode = String(body.mode ?? "channel");
    const videoId = typeof body.videoId === "string" ? body.videoId.trim() : "";

    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });

    const { serviceSupabase, user } = await requireWorkspaceAccess(request, workspaceId);
    const { data: profile, error: profileError } = await serviceSupabase
      .from("social_profiles")
      .select("*")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

    const normalized = normalizeSocialProfile({
      platform: profile.platform,
      profileUrl: profile.profile_url,
      username: profile.username,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      businessProfileLabel: profile.business_profile_label,
    });

    let sourceUrl = normalized.profileUrl ?? "";
    if (mode === "video") {
      if (!videoId) return NextResponse.json({ error: "videoId is required for single-video import." }, { status: 400 });
      sourceUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    }

    if (!sourceUrl) return NextResponse.json({ error: "No source URL is saved for this profile." }, { status: 400 });

    const existingSourceId = await findMatchingSourceId(serviceSupabase, workspaceId, sourceUrl, mode);
    const result = await runSourceImport({
      supabase: serviceSupabase,
      workspaceId,
      sourceUrl,
      userId: user.id,
      sourceId: existingSourceId ?? undefined,
    });

    return NextResponse.json({ result });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not import from this social profile." }, { status });
  }
}

async function findMatchingSourceId(serviceSupabase: any, workspaceId: string, sourceUrl: string, mode: string) {
  const parsed = parseSourceUrl(sourceUrl);
  const { data } = await serviceSupabase
    .from("sources")
    .select("id,metadata")
    .eq("workspace_id", workspaceId)
    .eq("platform", parsed.platform)
    .limit(250);

  const canonicalUrl = parsed.canonicalUrl;
  const kind = parsed.kind;

  for (const row of data ?? []) {
    const metadata = row.metadata ?? {};
    if (mode === "video") {
      if (metadata.kind === kind && metadata.canonicalUrl === canonicalUrl) return String(row.id);
      continue;
    }

    if (metadata.kind === kind && metadata.canonicalUrl === canonicalUrl) return String(row.id);
  }

  return null;
}
