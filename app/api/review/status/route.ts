import { NextResponse } from "next/server";
import { createServiceSupabaseClient, createUserSupabaseClient } from "@/lib/supabase";
import { isReviewUser, reviewGrantActive } from "@/lib/review-access";

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: { user }, error } = await createUserSupabaseClient(token).auth.getUser();
  const db = createServiceSupabaseClient();
  if (error || !user || !db || !isReviewUser(user)) return NextResponse.json({ error: "Review session required." }, { status: 403 });
  const { data: grant } = await db.from("review_access").select("user_id,workspace_id,expires_at,revoked_at").eq("user_id", user.id).maybeSingle();
  if (!reviewGrantActive(grant, user.id)) return NextResponse.json({ error: "Review expired." }, { status: 401 });
  return NextResponse.json({ expiresAt: grant.expires_at, workspaceId: grant.workspace_id }, { headers: { "Cache-Control": "private, no-store" } });
}
