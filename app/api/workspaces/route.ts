import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Sign in to load workspaces." }, { status: 401 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("workspace_members")
      .select("role,workspaces(id,name,slug,created_at)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const workspaces = (data ?? [])
      .map((row: any) => {
        const workspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
        if (!workspace?.id) return null;
        return {
          id: String(workspace.id),
          name: String(workspace.name ?? "Workspace"),
          slug: String(workspace.slug ?? ""),
          role: String(row.role ?? "member"),
          created_at: workspace.created_at ?? null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ workspaces });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load workspaces." }, { status: 400 });
  }
}
