"use client";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type Access = { user_id: string | null; expires_at: string; revoked_at: string | null; workspaces: { name: string } };
export function ReviewAccessSettings() {
  const [access, setAccess] = useState<Access | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function request(method = "GET") {
    const db = createBrowserSupabaseClient();
    const session = (await db?.auth.getSession())?.data.session;
    if (!session) throw new Error("Sign in first.");
    const response = await fetch("/api/admin/review-access", { method, headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Review access unavailable.");
    return payload;
  }
  useEffect(() => { let active = true; void request().then(result => { if (active) setAccess(result.access); }).catch(reason => { if (active) setError(reason.message); }); return () => { active = false; }; }, []);
  async function change(method: "POST" | "DELETE") {
    setBusy(true); setError(""); setCredentials(null);
    try {
      const result = await request(method);
      if (method === "POST") setCredentials({ email: result.email, password: result.password });
      setAccess((await request()).access);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Request failed."); }
    finally { setBusy(false); }
  }
  const active = !!access?.user_id && !access.revoked_at && Date.parse(access.expires_at) > Date.now();
  return <section className="sage-panel sage-form">
    <h2>Temporary AI review access</h2>
    <p>Read-only access to {access?.workspaces?.name || "Unmarked"} for four hours. Cannot import, publish, edit, manage accounts, or access connector credentials.</p>
    <p role="status">{active ? `Enabled until ${new Date(access!.expires_at).toLocaleString()}` : "Review access is disabled."}</p>
    <div className="sage-actions"><button disabled={busy || !access} onClick={() => void change("POST")}>{busy ? "Updating..." : active ? "Replace login and restart four hours" : "Enable for four hours"}</button><button disabled={busy || !active} onClick={() => void change("DELETE")}>Revoke access now</button></div>
    {credentials && <div>
      <p>Use the regular email/password sign-in. These credentials are shown only here and are not saved in your browser. Enabling again invalidates the previous account.</p>
      <label>Review email<input readOnly value={credentials.email} autoComplete="off" /></label>
      <label>Temporary password<input readOnly type="password" value={credentials.password} autoComplete="new-password" /></label>
      <button onClick={() => void navigator.clipboard.writeText(`Email: ${credentials.email}\nPassword: ${credentials.password}`).catch(() => setError("Clipboard unavailable. Select the fields to copy."))}>Copy review login</button>
      <button onClick={() => setCredentials(null)}>Hide credentials</button>
    </div>}
    {!!error && <p role="alert">{error}</p>}
  </section>;
}
