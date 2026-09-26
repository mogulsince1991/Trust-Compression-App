import { NextRequest, NextResponse } from "next/server";
import { isReviewUser, reviewGrantActive, reviewRequestAllowed } from "@/lib/review-access";

export async function middleware(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token.startsWith("tc_live_")) return NextResponse.next();
  // Claims only select the extra guard; the Auth service validates the token below.
  let claims;
  try { claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); }
  catch { return NextResponse.next(); }
  if (!isReviewUser(claims)) return NextResponse.next();
  const deny = (message: string, status = 403) => NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return deny("Review access is unavailable.", 503);
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://boswlaonbdxugkocquzv.supabase.co";
    const auth = await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!auth.ok) return deny("Invalid review session.", 401);
    const user = await auth.json();
    if (!user?.id || !isReviewUser(user)) return deny("Invalid review session.", 401);
    const query = new URLSearchParams({ select: "user_id,workspace_id,expires_at,revoked_at", user_id: `eq.${user.id}` });
    const result = await fetch(`${base}/rest/v1/review_access?${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!result.ok) return deny("Review access could not be verified.", 503);
    const [grant] = await result.json();
    if (!reviewGrantActive(grant, user.id)) return deny("Review access has expired or was revoked. Ask the owner to enable a new four-hour review.", 401);
    if (!reviewRequestAllowed(request.method, request.nextUrl.pathname, request.nextUrl.searchParams.get("workspaceId"), grant.workspace_id)) return deny("This review account is read-only. Account settings, imports, integrations and changes are unavailable.");
  } catch { return deny("Review access could not be verified.", 503); }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/api/:path*", "/mcp"] };
