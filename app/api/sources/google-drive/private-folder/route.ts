import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";

type ImportPrivateDriveRequest = {
  workspaceId?: string;
  connectedAccountId?: string;
  folderUrl?: string;
};

type DriveFile = {
  id: string;
  name?: string;
  mimeType?: string;
  description?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  videoMediaMetadata?: { durationMillis?: string; width?: number; height?: number };
};

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in before importing private Drive folders." }, { status: 401 });

    const body = (await request.json()) as ImportPrivateDriveRequest;
    const workspaceId = body.workspaceId?.trim();
    const connectedAccountId = body.connectedAccountId?.trim();
    const folderUrl = body.folderUrl?.trim();
    const folderId = folderUrl ? parseDriveFolderId(folderUrl) : null;

    if (!workspaceId || !connectedAccountId || !folderId) {
      return NextResponse.json({ error: "Workspace, connected Drive account, and Drive folder URL are required." }, { status: 400 });
    }

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const { data: account, error: accountError } = await supabase
      .from("connected_accounts")
      .select("id,account_label,access_token,scope,status,expires_at")
      .eq("id", connectedAccountId)
      .eq("workspace_id", workspaceId)
      .eq("provider", "google_drive")
      .maybeSingle();

    if (accountError || !account) return NextResponse.json({ error: accountError?.message ?? "Connected Drive account was not found." }, { status: 404 });
    if (account.status !== "connected" || !account.access_token) return NextResponse.json({ error: "Reconnect Google Drive before importing this folder." }, { status: 400 });
    if (account.expires_at && new Date(account.expires_at).getTime() <= Date.now()) return NextResponse.json({ error: "Google Drive access expired. Reconnect Google Drive." }, { status: 401 });

    const files = await fetchDriveVideos(folderId, account.access_token);

    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .insert({
        workspace_id: workspaceId,
        platform: "google_drive",
        connected_account_id: connectedAccountId,
        account_label: account.account_label || "Private Google Drive folder",
        status: "syncing",
        metadata: { sourceUrl: folderUrl, folderId, kind: "drive_private_folder", importMode: "drive_oauth_readonly" }
      })
      .select("id")
      .single();

    if (sourceError || !source) return NextResponse.json({ error: sourceError?.message ?? "Could not create Drive source." }, { status: 500 });

    let imported = 0;
    let updated = 0;

    for (const file of files) {
      const payload = driveFileToVideoPayload({ file, workspaceId, sourceId: source.id, folderUrl, folderId, userId: user.id });
      const { data: existing } = await supabase
        .from("videos")
        .select("id,metadata,title,thumbnail_url")
        .eq("workspace_id", workspaceId)
        .eq("source_platform", "google_drive")
        .eq("external_id", file.id)
        .maybeSingle();

      if (existing?.id) {
        const metadata = (existing.metadata ?? {}) as Record<string, unknown>;
        const localTitleOverride = Boolean(metadata.localTitleOverride);
        const localThumbnailOverride = Boolean(metadata.localThumbnailOverride);
        const { error } = await supabase
          .from("videos")
          .update({
            ...payload,
            title: localTitleOverride ? existing.title : payload.title,
            thumbnail_url: localThumbnailOverride ? existing.thumbnail_url : payload.thumbnail_url,
            metadata: { ...metadata, ...(payload.metadata as Record<string, unknown>), localTitleOverride, localThumbnailOverride },
            updated_at: new Date().toISOString(),
            deleted_at: null
          })
          .eq("id", existing.id);
        if (error) throw error;
        updated += 1;
      } else {
        const { error } = await supabase.from("videos").insert(payload);
        if (error) throw error;
        imported += 1;
      }
    }

    await supabase
      .from("sources")
      .update({
        status: "connected",
        last_synced_at: new Date().toISOString(),
        metadata: { sourceUrl: folderUrl, folderId, kind: "drive_private_folder", importMode: "drive_oauth_readonly", imported, updated, total: files.length }
      })
      .eq("id", source.id);

    return NextResponse.json({ sourceId: source.id, platform: "google_drive", kind: "drive_private_folder", importMode: "drive_oauth_readonly", imported, updated, skippedDuplicates: updated, duplicateCandidates: 0, total: files.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Private Drive import failed." }, { status: 400 });
  }
}

async function fetchDriveVideos(folderId: string, accessToken: string) {
  const files: DriveFile[] = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false and mimeType contains 'video/'`,
      fields: "nextPageToken,files(id,name,mimeType,description,thumbnailLink,webViewLink,createdTime,modifiedTime,size,videoMediaMetadata)",
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true"
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = (await response.json()) as { error?: { message?: string }; nextPageToken?: string; files?: DriveFile[] };
    if (!response.ok) throw new Error(data.error?.message ?? "Google Drive folder import failed.");
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? "";
  } while (pageToken && files.length < 500);

  if (!files.length) throw new Error("No video files were found in that Drive folder, or the connected account cannot access it.");
  return files.slice(0, 500);
}

function driveFileToVideoPayload({ file, workspaceId, sourceId, folderUrl, folderId, userId }: { file: DriveFile; workspaceId: string; sourceId: string; folderUrl: string; folderId: string; userId: string }) {
  return {
    workspace_id: workspaceId,
    source_id: sourceId,
    external_id: file.id,
    title: file.name ?? "Google Drive video",
    source_platform: "google_drive",
    source_url: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
    embed_url: `https://drive.google.com/file/d/${file.id}/preview`,
    thumbnail_url: file.thumbnailLink ?? null,
    duration_seconds: file.videoMediaMetadata?.durationMillis ? Math.round(Number(file.videoMediaMetadata.durationMillis) / 1000) : null,
    summary: file.description?.slice(0, 500) ?? null,
    proof_type: "Education",
    buying_stage: "consideration",
    sales_category: "Education",
    funnel_stage: "consideration",
    transcript_status: "pending",
    tags: ["Google Drive", "Private Drive"],
    published_at: file.createdTime ?? file.modifiedTime ?? null,
    deleted_at: null,
    metadata: {
      importMode: "drive_oauth_readonly",
      sourceUrl: folderUrl,
      folderId,
      mimeType: file.mimeType ?? "video/unknown",
      size: file.size ?? null,
      width: file.videoMediaMetadata?.width ?? null,
      height: file.videoMediaMetadata?.height ?? null,
      modifiedTime: file.modifiedTime ?? null,
      importedTitle: file.name ?? "Google Drive video",
      importedThumbnailUrl: file.thumbnailLink ?? null,
      originalTitle: file.name ?? "Google Drive video",
      originalThumbnailUrl: file.thumbnailLink ?? null,
      captionAvailable: false,
      readonly: true
    },
    created_by: userId,
    updated_at: new Date().toISOString()
  };
}

function parseDriveFolderId(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const folderIndex = parts.indexOf("folders");
    if (folderIndex >= 0 && parts[folderIndex + 1]) return parts[folderIndex + 1];
    return url.searchParams.get("folderId");
  } catch {
    return null;
  }
}
