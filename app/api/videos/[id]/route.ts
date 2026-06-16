import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";

type RouteContext = {
  params: { id: string };
};

type VideoPatchRequest = {
  workspaceId?: string;
  title?: string;
  thumbnailUrl?: string;
  suggestedUse?: string;
  salesCategory?: string;
  funnelStage?: string;
  proofType?: string;
  buyingStage?: string;
  tags?: string[];
  customContext?: {
    notes?: string;
    targetBuyer?: string;
    objections?: string;
    offer?: string;
    audience?: string;
  };
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in before updating videos." }, { status: 401 });

    const body = (await request.json()) as VideoPatchRequest;
    const workspaceId = body.workspaceId?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const { data: current, error: currentError } = await supabase
      .from("videos")
      .select("id,title,thumbnail_url,metadata,tags")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .single();
    if (currentError || !current) return NextResponse.json({ error: currentError?.message ?? "Video was not found." }, { status: 404 });

    const currentMetadata = ((current.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    const nextTitle = typeof body.title === "string" ? body.title.trim() : undefined;
    const nextThumbnailUrl = typeof body.thumbnailUrl === "string" ? normalizeThumbnailUrl(body.thumbnailUrl.trim()) : undefined;

    if (nextThumbnailUrl && !isSafeExternalImageUrl(nextThumbnailUrl)) {
      return NextResponse.json({ error: "Thumbnail must be an https image link or a Google Drive image link." }, { status: 400 });
    }

    const nextMetadata = {
      ...currentMetadata,
      originalTitle: currentMetadata.originalTitle ?? current.title ?? null,
      originalThumbnailUrl: currentMetadata.originalThumbnailUrl ?? current.thumbnail_url ?? null,
      localTitleOverride: nextTitle !== undefined ? Boolean(nextTitle && nextTitle !== currentMetadata.originalTitle) : Boolean(currentMetadata.localTitleOverride),
      localThumbnailOverride: nextThumbnailUrl !== undefined ? Boolean(nextThumbnailUrl && nextThumbnailUrl !== currentMetadata.originalThumbnailUrl) : Boolean(currentMetadata.localThumbnailOverride),
      customContext: {
        ...(typeof currentMetadata.customContext === "object" && currentMetadata.customContext ? (currentMetadata.customContext as Record<string, unknown>) : {}),
        ...(body.customContext ?? {}),
        updatedAt: new Date().toISOString()
      }
    };

    const nextTags = Array.from(new Set([...(Array.isArray(current.tags) ? current.tags : []), ...(body.tags ?? [])].map((tag) => tag.trim()).filter(Boolean)));

    const payload: Record<string, unknown> = {
      suggested_use: body.suggestedUse?.trim() || null,
      sales_category: body.salesCategory?.trim() || null,
      funnel_stage: body.funnelStage?.trim() || null,
      proof_type: body.proofType?.trim() || body.salesCategory?.trim() || null,
      buying_stage: body.buyingStage?.trim() || body.funnelStage?.trim() || null,
      tags: nextTags,
      metadata: nextMetadata,
      updated_at: new Date().toISOString()
    };

    if (nextTitle !== undefined) payload.title = nextTitle || current.title;
    if (nextThumbnailUrl !== undefined) payload.thumbnail_url = nextThumbnailUrl || current.thumbnail_url;

    const { data, error } = await supabase.from("videos").update(payload).eq("id", params.id).eq("workspace_id", workspaceId).select("*").single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not update video." }, { status: 500 });

    return NextResponse.json({ video: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Video update failed." }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in before deleting videos." }, { status: 401 });

    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const { error } = await supabase
      .from("videos")
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("workspace_id", workspaceId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Video archive failed." }, { status: 400 });
  }
}

function isSafeExternalImageUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "drive.google.com" || host === "docs.google.com" || host.endsWith("googleusercontent.com")) return true;
    return /\.(avif|gif|jpe?g|png|webp)(\?.*)?$/i.test(url.pathname + url.search) || host.includes("images") || host.includes("img") || host.includes("cdn");
  } catch {
    return false;
  }
}

function normalizeThumbnailUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === "drive.google.com" || host === "docs.google.com") {
      const id = getGoogleDriveFileId(url);
      if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1000`;
    }
  } catch {
    return value;
  }
  return value;
}

function getGoogleDriveFileId(url: URL) {
  const directId = url.searchParams.get("id");
  if (directId) return directId;

  const match = url.pathname.match(/\/(?:file\/d|open)\/([^/?#]+)/);
  if (match?.[1]) return match[1];

  return null;
}
