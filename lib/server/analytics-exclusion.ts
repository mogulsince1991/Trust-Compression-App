import { createHmac, timingSafeEqual } from "node:crypto";
import { createUserSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase";

export function internalBrowserToken(workspaces: string[]) {
  const payload = Buffer.from(JSON.stringify({ workspaces: workspaces.slice(0, 60), expires: Date.now() + 86400000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
function signature(value: string) { return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY || "").update(`analytics:${value}`).digest("hex"); }
export function internalBrowserWorkspace(cookie: string, workspace: string) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const token = cookie.split(";").map(v => v.trim()).find(v => v.startsWith("tt_internal="))?.slice(12) || "";
    const [payload, signed] = token.split(".");
    if (!payload || !signed || signed.length !== 64) return false;
    if (!timingSafeEqual(Buffer.from(signed), Buffer.from(signature(payload)))) return false;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    return value.expires > Date.now() && value.workspaces.includes(workspace);
  } catch { return false; }
}

export async function analyticsExclusion(request: Request, workspaceId: string, browserOptOut = false) {
  const cookie = request.headers.get("cookie") || "";
  if (browserOptOut || /(?:^|;\s*)tt_exclude=1(?:;|$)/.test(cookie)) return "browser_opt_out";
  if (internalBrowserWorkspace(cookie, workspaceId)) return "workspace_browser";
  const supabase = createServiceSupabaseClient();
  if (!supabase) throw Error("Analytics service unavailable");
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (token) {
    const { data: { user }, error } = await createUserSupabaseClient(token).auth.getUser();
    if (error || !user) throw Error("Invalid session");
    const { data, error: lookupError } = await supabase.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
    if (lookupError) throw lookupError;
    if (data) return "workspace_member";
  }
  const { data, error } = await supabase.from("workspaces").select("settings").eq("id", workspaceId).single();
  if (error) throw error;
  const ip = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() : null;
  return ip && Array.isArray(data.settings?.analyticsExcludedIps) && data.settings.analyticsExcludedIps.includes(ip) ? "workspace_ip" : null;
}
