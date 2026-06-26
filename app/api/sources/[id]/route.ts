import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";

type RouteContext = {
  params: { id: string };
};

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in before deleting sources." }, { status: 401 });

    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .select("id")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (sourceError || !source) return NextResponse.json({ error: sourceError?.message ?? "Source was not found." }, { status: 404 });

    const { error } = await supabase.from("sources").delete().eq("id", params.id).eq("workspace_id", workspaceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Source delete failed." }, { status: 400 });
  }
}
