import { NextResponse } from "next/server";
import { runSourceImport } from "@/lib/import-runner";
import { createUserSupabaseClient } from "@/lib/supabase";
import { POST as importPrivateFolder } from "../../google-drive/private-folder/route";

export const maxDuration = 300;

type RouteContext = {
  params: { id: string };
};

type ReimportRequest = {
  workspaceId?: string;
  fullRefresh?: boolean;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in before reimporting sources." }, { status: 401 });

    const body = (await request.json()) as ReimportRequest;
    const workspaceId = body.workspaceId?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .select("id,workspace_id,metadata,connected_account_id,status")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (sourceError || !source) return NextResponse.json({ error: sourceError?.message ?? "Source was not found." }, { status: 404 });

    const sourceUrl = String(source.metadata?.sourceUrl ?? source.metadata?.canonicalUrl ?? "").trim();
    if (!sourceUrl) return NextResponse.json({ error: "This source does not have a saved URL to reimport." }, { status: 400 });

    const startedAt = new Date().toISOString();
    if (source.status === "syncing" && Date.now() - Date.parse(source.metadata?.refreshStartedAt ?? "") < 330000) {
      return NextResponse.json({ error: "This source is already refreshing. Try again shortly." }, { status: 409 });
    }
    // Compare-and-set the prior metadata as well as status, including expired leases.
    const claim = supabase.from("sources").update({ status: "syncing", metadata: { ...source.metadata, refreshStartedAt: startedAt } })
      .eq("id", source.id).eq("workspace_id", workspaceId);
    const { data: claimed, error: claimError } = await (source.metadata == null ? claim.is("metadata", null) : claim.eq("metadata", JSON.stringify(source.metadata)))
      .select("id").maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claimed) return NextResponse.json({ error: "Another refresh just started. Try again shortly." }, { status: 409 });
    try {
      if (source.metadata?.kind === "drive_private_folder") {
        const response = await importPrivateFolder(new Request(request.url, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, sourceId: source.id, connectedAccountId: source.connected_account_id, folderUrl: sourceUrl })
        }));
        if (!response.ok) { const detail = await response.json(); throw new Error(detail.error ?? "Private folder refresh failed."); }
        return response;
      }
      const result = await runSourceImport({ supabase, workspaceId, sourceUrl, userId: user.id, sourceId: source.id, fullRefresh: body.fullRefresh === true });
      return NextResponse.json(result);
    } catch (error) {
      await supabase.from("sources").update({ status: "error", error: error instanceof Error ? error.message : "Refresh failed." }).eq("id", source.id).eq("workspace_id", workspaceId);
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Source reimport failed." }, { status: 400 });
  }
}
