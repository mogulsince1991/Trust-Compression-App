import { NextResponse } from "next/server";
import { runSourceImport } from "@/lib/import-runner";
import { createUserSupabaseClient } from "@/lib/supabase";

type ImportRequest = {
  workspaceId?: string;
  sourceUrl?: string;
};

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in before importing sources." }, { status: 401 });

    const body = (await request.json()) as ImportRequest;
    const workspaceId = body.workspaceId?.trim();
    const sourceUrl = body.sourceUrl?.trim();
    if (!workspaceId || !sourceUrl) return NextResponse.json({ error: "Workspace and source URL are required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const result = await runSourceImport({ supabase, workspaceId, sourceUrl, userId: user.id });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Source import failed." }, { status: 400 });
  }
}
