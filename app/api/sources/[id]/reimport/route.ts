import { NextResponse } from "next/server";
import { runSourceImport } from "@/lib/import-runner";
import { createUserSupabaseClient } from "@/lib/supabase";

type RouteContext = {
  params: { id: string };
};

type ReimportRequest = {
  workspaceId?: string;
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
      .select("id,workspace_id,metadata")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (sourceError || !source) return NextResponse.json({ error: sourceError?.message ?? "Source was not found." }, { status: 404 });

    const sourceUrl = String(source.metadata?.sourceUrl ?? source.metadata?.canonicalUrl ?? "").trim();
    if (!sourceUrl) return NextResponse.json({ error: "This source does not have a saved URL to reimport." }, { status: 400 });

    const result = await runSourceImport({ supabase, workspaceId, sourceUrl, userId: user.id, sourceId: source.id });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Source reimport failed." }, { status: 400 });
  }
}
