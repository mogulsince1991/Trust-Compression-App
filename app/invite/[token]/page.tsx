"use client";

import { ArrowUpRight, Loader2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type InvitePageProps = {
  params: { token: string };
};

export default function InvitePage({ params }: InvitePageProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (session && !accepted) void acceptInvite();
  }, [session, accepted]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !email) return;
    setWorking(true);
    setError("");
    setMessage("");

    if (password.length >= 6) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setWorking(false);
      if (signInError) setError(signInError.message);
      return;
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href }
    });
    setWorking(false);
    if (otpError) setError(otpError.message);
    else setMessage("Check your email. After you sign in, this invite will finish automatically.");
  }

  async function acceptInvite() {
    if (!session) return;
    setWorking(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/workspace/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ token: params.token })
    });
    const result = (await response.json()) as { workspaceId?: string; error?: string };
    setWorking(false);

    if (!response.ok || !result.workspaceId) {
      setError(result.error ?? "Could not accept this invite.");
      return;
    }

    setAccepted(true);
    setMessage("Invite accepted. Opening the workspace...");
    window.location.href = "/";
  }

  return (
    <main className="role-gate">
      <section className="gate-intro">
        <span>Workspace invite</span>
        <h1>Join the company library.</h1>
        <p>Sign in with the invited email address. Once accepted, your access is handled by the workspace instead of the old role picker.</p>
      </section>
      {!session && (
        <form className="prospect-brief" onSubmit={signIn}>
          <div className="brief-grid">
            <label className="wide-field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label>
            <label className="wide-field"><span>Password optional</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Use password or leave blank for magic link" /></label>
          </div>
          <button className="wide-action" disabled={working}>{working ? <Loader2 className="spin" /> : <ArrowUpRight />}Continue</button>
        </form>
      )}
      {session && !accepted && <button className="wide-action" disabled={working} onClick={acceptInvite}>{working ? <Loader2 className="spin" /> : <ArrowUpRight />}Accept invite</button>}
      {(message || error) && <p className={error ? "status-line is-error" : "status-line"}>{error || message}</p>}
    </main>
  );
}
