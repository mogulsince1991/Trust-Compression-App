import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";

type RouteContext = { params: { id: string } };
type RestoreRequest = { workspaceId?: string; republish?: boolean };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in before restoring journeys." }, { status: 401 });

    const body = (await request.json()) as RestoreRequest;
    const workspaceId = body.workspaceId?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const restoredAt = new Date().toISOString();
    const patch: Record<string, unknown> = { deleted_at: null, updated_at: restoredAt };
    if (body.republish) {
      patch.is_public = true;
      patch.published_at = restoredAt;
    }

    const { data, error } = await supabase
      .from("journeys")
      .update(patch)
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .select("id")
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message ?? "Journey was not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Journey restore failed." }, { status: 400 });
  }
}
