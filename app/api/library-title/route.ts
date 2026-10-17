import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/server/route-auth";

export async function PATCH(request: Request) {
  try {
    const { workspaceId, id, kind, title } = await request.json();
    if (!workspaceId || !id || !["video", "asset"].includes(kind) || typeof title !== "string" || !title.trim() || title.trim().length > 250) return NextResponse.json({ error: "Enter a display title of 1 to 250 characters." }, { status: 400 });
    const { userSupabase } = await requireWorkspaceAccess(request, workspaceId);
    const table = kind === "video" ? "videos" : "library_assets";
    const { data: current, error } = await userSupabase.from(table).select("title,metadata").eq("workspace_id", workspaceId).eq("id", id).single();
    if (error || !current) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    const metadata = { ...current.metadata, originalTitle: current.metadata?.originalTitle ?? current.title, localTitleOverride: true };
    const { data, error: updateError } = await userSupabase.from(table).update({ title: title.trim(), metadata }).eq("workspace_id", workspaceId).eq("id", id).select("title,metadata").single();
    if (updateError) throw updateError;
    return NextResponse.json(data);
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Could not save the title." }, { status: error?.status || 500 }); }
}
