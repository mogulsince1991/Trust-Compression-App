import { NextResponse } from "next/server";
import { requireWorkspaceAccess, requireWorkspaceManager } from "@/lib/server/route-auth";
import { canUploadPhotos, workspacePhotoToken } from "@/lib/server/workspace-photo-storage";
import { drive } from "@/lib/server/google-photos-drive";

export const dynamic = "force-dynamic";
const reply = (data: object, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  try {
    const url = new URL(request.url), workspaceId = url.searchParams.get("workspaceId") || "";
    const context = await requireWorkspaceAccess(request, workspaceId);
    if (url.searchParams.get("folders") === "1") {
      requireWorkspaceManager(context);
      const { token } = await workspacePhotoToken(context, workspaceId);
      const params = new URLSearchParams({ q: "trashed=false and mimeType='application/vnd.google-apps.folder'", fields: "files(id,name)", pageSize: "100" });
      const folders = await drive(token, `files?${params}`);
      return reply({ folders: folders.files || [] });
    }
    const result = await context.serviceSupabase.from("workspace_photo_storage").select("provider,account_label,folder_id,folder_name,status,last_error").eq("workspace_id", workspaceId).maybeSingle();
    if (result.error) throw Error("Could not load photo storage.");
    return reply({ connection: result.data, canManage: ["owner", "admin"].includes(context.workspaceRole), canUpload: canUploadPhotos(context.workspaceRole) });
  } catch (e) { return failure(e); }
}
export async function PATCH(request: Request) {
  try {
    const { workspaceId, folderId } = await request.json();
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, workspaceId));
    if (typeof folderId !== "string" || !/^[\w-]{10,200}$/.test(folderId)) throw Error("Choose a valid Drive folder.");
    const { token, connection } = await workspacePhotoToken(context, workspaceId);
    const folder = await drive(token, `files/${folderId}?fields=id,name,mimeType,trashed,capabilities(canAddChildren)`);
    if (folder.trashed || folder.mimeType !== "application/vnd.google-apps.folder" || !folder.capabilities?.canAddChildren) throw Error("This folder is unavailable or cannot receive uploads.");
    const saved = await context.serviceSupabase.from("workspace_photo_storage").update({ folder_id: folder.id, folder_name: folder.name, updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("connection_id", connection.connection_id).select("workspace_id").maybeSingle();
    if (saved.error || !saved.data) throw Error("Storage changed. Reload and try again.");
    return reply({ ok: true });
  } catch (e) { return failure(e); }
}
export async function DELETE(request: Request) {
  try {
    const { workspaceId } = await request.json();
    const context = requireWorkspaceManager(await requireWorkspaceAccess(request, workspaceId));
    const result = await context.serviceSupabase.from("workspace_photo_storage").delete().eq("workspace_id", workspaceId);
    if (result.error) throw Error("Could not disconnect storage.");
    return reply({ ok: true });
  } catch (e) { return failure(e); }
}
function failure(e: unknown) { return reply({ error: e instanceof Error ? e.message : "Storage request failed." }, typeof e === "object" && e && "status" in e ? Number(e.status) : 400); }
