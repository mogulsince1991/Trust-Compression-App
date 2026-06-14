import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";

type RouteContext = { params: { id: string } };
type RestoreRequest = { workspaceId?: string };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in before restoring videos." }, { status: 401 });

    const body = (await request.json()) as RestoreRequest;
    const workspaceId = body.workspaceId?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const { data, error } = await supabase
      .from("videos")
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .select("id")
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message ?? "Video was not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Video restore failed." }, { status: 400 });
  }
}
