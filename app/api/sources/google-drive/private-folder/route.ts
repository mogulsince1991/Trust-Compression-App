import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";
import { preserveCuratedFields } from "@/lib/source-refresh";

type ImportPrivateDriveRequest = {
  workspaceId?: string;
  connectedAccountId?: string;
  folderUrl?: string;
  sourceId?: string;
  automatic?: boolean;
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

type DriveVideo = DriveFile & {
  folderId: string;
  folderPath: string;
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

    const files = await fetchDriveVideosRecursively(folderId, account.access_token);

    const sourcePayload = {
        workspace_id: workspaceId,
        platform: "google_drive",
        connected_account_id: connectedAccountId,
        account_label: account.account_label || "Private Google Drive folder",
        status: "syncing",
        metadata: { sourceUrl: folderUrl, folderId, kind: "drive_private_folder", importMode: "drive_oauth_readonly" }
      };
    if (body.sourceId) {
      const { data: existing } = await supabase.from("sources").select("id,metadata").eq("id", body.sourceId).eq("workspace_id", workspaceId).eq("connected_account_id", connectedAccountId).maybeSingle();
      if (!existing || existing.metadata?.folderId !== folderId) return NextResponse.json({ error: "Source does not match this folder and workspace." }, { status: 404 });
      sourcePayload.metadata = { ...existing.metadata, ...sourcePayload.metadata };
    }
    const { data: source, error: sourceError } = await (body.sourceId
      ? supabase.from("sources").update(sourcePayload).eq("id", body.sourceId).eq("workspace_id", workspaceId)
      : supabase.from("sources").insert(sourcePayload)).select("id").single();

    if (sourceError || !source) return NextResponse.json({ error: sourceError?.message ?? "Could not create Drive source." }, { status: 500 });

    let imported = 0;
    let updated = 0;
    const known = new Set<string>();
    if (body.automatic) {
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from("videos").select("external_id").eq("workspace_id", workspaceId).eq("source_platform", "google_drive").order("id").range(offset, offset + 499);
        if (error) throw error;
        for (const row of data ?? []) if (row.external_id) known.add(row.external_id);
        if (!data || data.length < 500) break;
      }
    }

    for (const file of files) {
      if (body.automatic && known.has(file.id)) continue;
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
            ...preserveCuratedFields(payload),
            title: localTitleOverride ? existing.title : payload.title,
            thumbnail_url: localThumbnailOverride ? existing.thumbnail_url : payload.thumbnail_url,
            metadata: { ...metadata, ...(payload.metadata as Record<string, unknown>), localTitleOverride, localThumbnailOverride },
            updated_at: new Date().toISOString()
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

    const { error: completionError } = await supabase
      .from("sources")
      .update({
        status: "connected",
        error: null,
        last_synced_at: new Date().toISOString(),
        metadata: { sourceUrl: folderUrl, folderId, kind: "drive_private_folder", importMode: "drive_oauth_readonly", imported, updated, total: files.length }
      })
      .eq("id", source.id);
    if (completionError) throw new Error(completionError.message);

    return NextResponse.json({ sourceId: source.id, platform: "google_drive", kind: "drive_private_folder", importMode: "drive_oauth_readonly", imported, updated, skippedDuplicates: updated, duplicateCandidates: 0, total: files.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Private Drive import failed." }, { status: 400 });
  }
}

const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const MAX_DRIVE_FILES = 2500;
const MAX_DRIVE_FOLDERS = 250;

async function fetchDriveVideosRecursively(rootFolderId: string, accessToken: string) {
  const files: DriveVideo[] = [];
  const queue = [{ id: rootFolderId, path: "" }];
  const visited = new Set<string>();

  while (queue.length) {
    const folder = queue.shift()!;
    if (visited.has(folder.id)) continue;
    if (visited.size >= MAX_DRIVE_FOLDERS) throw new Error("Refresh exceeds 250 folders. Connect smaller subfolders.");
    visited.add(folder.id);

    let pageToken = "";
    do {
      const params = new URLSearchParams({
        q: `'${folder.id}' in parents and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,description,thumbnailLink,webViewLink,createdTime,modifiedTime,size,videoMediaMetadata)",
        pageSize: "100",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true"
      });
      if (pageToken) params.set("pageToken", pageToken);

      const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20000)
      });
      const data = (await response.json()) as { error?: { message?: string }; nextPageToken?: string; files?: DriveFile[] };
      if (!response.ok) throw new Error(data.error?.message ?? "Google Drive folder import failed.");

      for (const file of data.files ?? []) {
        if (file.mimeType === DRIVE_FOLDER_MIME_TYPE) {
          queue.push({ id: file.id, path: [folder.path, file.name ?? "Untitled folder"].filter(Boolean).join("/") });
        } else if (file.mimeType?.startsWith("video/")) {
          if (files.length >= MAX_DRIVE_FILES) throw new Error("Refresh exceeds 2,500 videos. Connect smaller subfolders.");
          files.push({ ...file, folderId: folder.id, folderPath: folder.path });
        }
      }

      pageToken = data.nextPageToken ?? "";
    } while (pageToken);
  }

  if (!files.length) throw new Error("No video files were found in that Drive folder tree, or the connected account cannot access it.");
  return files;
}

function driveFileToVideoPayload({ file, workspaceId, sourceId, folderUrl, folderId, userId }: { file: DriveVideo; workspaceId: string; sourceId: string; folderUrl: string; folderId: string; userId: string }) {
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
      rootFolderId: folderId,
      folderId: file.folderId,
      folderPath: file.folderPath,
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
