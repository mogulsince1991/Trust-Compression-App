import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireWorkspaceAccess, requireWorkspaceManager } from "@/lib/server/route-auth";
import { sealStorage, STORAGE_SCOPE, storageOAuthConfig } from "@/lib/server/workspace-photo-storage";

export async function POST(request: Request) {
  try {
    const { workspaceId } = await request.json();
    const { serviceSupabase: db, user } = requireWorkspaceManager(await requireWorkspaceAccess(request, workspaceId));
    const { clientId } = storageOAuthConfig();
    const state = randomBytes(32).toString("hex"), verifier = randomBytes(32).toString("base64url");
    await db.from("photo_storage_oauth_states").delete().lt("expires_at", new Date().toISOString());
    const saved = await db.from("photo_storage_oauth_states").insert({ state_hash: createHash("sha256").update(state).digest("hex"), workspace_id: workspaceId, user_id: user.id, verifier: sealStorage({ verifier }, workspaceId) });
    if (saved.error) throw Error("Could not start storage connection.");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: `${new URL(request.url).origin}/api/workspace-storage/callback`, response_type: "code", scope: `${STORAGE_SCOPE} openid email`, access_type: "offline", prompt: "consent select_account", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
    const response = NextResponse.json({ authUrl: url.toString() }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set("tt_storage_oauth", state, { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/api/workspace-storage", maxAge: 600 });
    return response;
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Could not connect storage." }, { status: typeof e === "object" && e && "status" in e ? Number(e.status) : 400 }); }
}
