import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/platform-admin";
import { recordActivity } from "@/lib/server/activity";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function admin(request: Request) {
  const context = await requirePlatformAdmin(request);
  if (context.role !== "super_admin") throw Object.assign(new Error("Only the super administrator can enable review access."), { status: 403 });
  return context;
}
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Review access could not be updated." }, { status: (error as { status?: number })?.status || 400, headers });
}
export async function GET(request: Request) {
  try {
    const { serviceSupabase: db } = await admin(request);
    const { data, error } = await db.from("review_access").select("workspace_id,user_id,enabled_at,expires_at,revoked_at,workspaces(name)").eq("singleton", true).single();
    if (error) throw error;
    return NextResponse.json({ access: data }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { serviceSupabase: db, user: administrator } = await admin(request);
    const { data: previous, error: previousError } = await db.from("review_access").select("workspace_id,user_id").eq("singleton", true).single();
    if (previousError) throw previousError;
    const email = `review-${randomUUID()}@review.trusttale.invalid`;
    const password = randomBytes(32).toString("base64url");
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { review_account: true }, user_metadata: { display_name: "AI Review (read-only)" } });
    if (error || !data.user) throw error || new Error("Could not create the review account.");
    const { data: expiresAt, error: activationError } = await db.rpc("activate_review_access", { review_user: data.user.id, administrator: administrator.id });
    if (activationError) {
      await db.auth.admin.deleteUser(data.user.id);
      throw activationError;
    }
    if (previous.user_id) await db.auth.admin.updateUserById(previous.user_id, { ban_duration: "876000h", password: randomBytes(32).toString("base64url") });
    await recordActivity(db, { workspaceId: previous.workspace_id, actorUserId: administrator.id, eventType: "review_access_enabled", entityType: "review_access", entityId: data.user.id, metadata: { durationHours: 4, readonly: true } });
    return NextResponse.json({ email, password, expiresAt, workspaceId: previous.workspace_id }, { headers });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try {
    const { serviceSupabase: db, user } = await admin(request);
    const { data, error } = await db.from("review_access").update({ revoked_at: new Date().toISOString(), expires_at: new Date().toISOString() }).eq("singleton", true).select("user_id,workspace_id").single();
    if (error) throw error;
    if (data.user_id) await db.auth.admin.updateUserById(data.user_id, { ban_duration: "876000h", password: randomBytes(32).toString("base64url") });
    await recordActivity(db, { workspaceId: data.workspace_id, actorUserId: user.id, eventType: "review_access_revoked", entityType: "review_access", entityId: data.user_id });
    return NextResponse.json({ revoked: true }, { headers });
  } catch (error) { return failure(error); }
}
