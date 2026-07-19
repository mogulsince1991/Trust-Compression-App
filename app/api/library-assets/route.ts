import { NextResponse } from "next/server";
import { normalizeJourneyEmbed } from "@/lib/journey-embeds";
import { httpError, requireWorkspaceAccess } from "@/lib/server/route-auth";

type LibraryAssetRequest = {
  workspaceId?: string;
  title?: string;
  url?: string;
  summary?: string;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim();
    if (!workspaceId) throw httpError(400, "Workspace is required.");

    const { serviceSupabase } = await requireWorkspaceAccess(request, workspaceId);
    const { data, error } = await serviceSupabase
      .from("library_assets")
      .select("id,workspace_id,asset_type,source_platform,title,source_url,embed_url,thumbnail_url,summary,metadata,created_at,updated_at,archived_at")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) throw httpError(500, error.message);
    return NextResponse.json({ assets: data ?? [] });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof (error as any).status === "number" ? (error as any).status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load library assets." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LibraryAssetRequest;
    const workspaceId = body.workspaceId?.trim();
    if (!workspaceId) throw httpError(400, "Workspace is required.");
    if (!body.url?.trim()) throw httpError(400, "Add a cloud URL or iframe embed code.");

    const { user, serviceSupabase } = await requireWorkspaceAccess(request, workspaceId);
    const normalized = normalizeJourneyEmbed({ url: body.url, title: body.title ?? "" });

    const { data: existing, error: existingError } = await serviceSupabase
      .from("library_assets")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("embed_url", normalized.embedUrl)
      .maybeSingle();

    if (existingError) throw httpError(500, existingError.message);

    const payload = {
      workspace_id: workspaceId,
      asset_type: normalized.assetType,
      source_platform: normalized.sourcePlatform,
      title: normalized.title,
      source_url: normalized.sourceUrl,
      embed_url: normalized.embedUrl,
      thumbnail_url: normalized.thumbnailUrl,
      summary: body.summary?.trim() || null,
      metadata: normalized.metadata,
      archived_at: null,
      created_by: user.id,
    };

    const query = existing?.id
      ? serviceSupabase.from("library_assets").update(payload).eq("id", existing.id).eq("workspace_id", workspaceId)
      : serviceSupabase.from("library_assets").insert(payload);

    const { data, error } = await query
      .select("id,workspace_id,asset_type,source_platform,title,source_url,embed_url,thumbnail_url,summary,metadata,created_at,updated_at,archived_at")
      .single();

    if (error || !data) throw httpError(500, error?.message ?? "Could not save library asset.");
    return NextResponse.json({ asset: data });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof (error as any).status === "number" ? (error as any).status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save library asset." }, { status });
  }
}
