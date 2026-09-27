"use client";

import { ArrowUpRight, Loader2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const attempted = useRef("");
  const accepting = useRef(false);
  const callbackUrl = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/invite/${params.token}`)}`;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (session && !accepted && attempted.current !== `${params.token}:${session.user.id}`) {
      attempted.current = `${params.token}:${session.user.id}`;
      void acceptInvite();
    }
  }, [session, accepted]);

  async function googleSignIn() {
    if (!supabase) return;
    setWorking(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl(), queryParams: { prompt: "select_account" } } });
      if (error) throw error;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not start Google sign-in.");
      setWorking(false);
    }
  }

  async function switchAccount() {
    if (!supabase) return;
    setWorking(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      attempted.current = "";
      setSession(null);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign out.");
    } finally { setWorking(false); }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !email) return;
    setWorking(true);
    setError("");
    setMessage("");

    try {
    if (password.length > 0) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setWorking(false);
      if (signInError) setError(signInError.message);
      return;
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() }
    });
    setWorking(false);
    if (otpError) setError(otpError.message);
    else setMessage("Check your email. After you sign in, this invite will finish automatically.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign in. Please try again.");
    } finally { setWorking(false); }
  }

  async function acceptInvite() {
    if (!session || accepting.current) return;
    accepting.current = true;
    setWorking(true);
    setError("");
    setMessage("");
    try {
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
    try { window.localStorage.setItem("trust-compression.workspace-id", result.workspaceId); } catch {}
    window.location.href = "/app/home";
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not accept this invite. Please try again.");
    } finally {
      accepting.current = false;
      setWorking(false);
    }
  }

  return (
    <main className="role-gate">
      <section className="gate-intro">
        <span>Workspace invite</span>
        <h1>Join the company library.</h1>
        <p>Use Google or email to sign in with the exact email address your workspace administrator authorized.</p>
      </section>
      {!session && (
        <form className="prospect-brief" onSubmit={signIn}>
          <button type="button" className="wide-action" disabled={working || !supabase} onClick={() => void googleSignIn()}>Continue with Google</button>
          <p>Or sign in with email</p>
          <div className="brief-grid">
            <label className="wide-field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label>
            <label className="wide-field"><span>Password optional</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Use password or leave blank for magic link" /></label>
          </div>
          <button className="wide-action" disabled={working}>{working ? <Loader2 className="spin" /> : <ArrowUpRight />}Continue</button>
        </form>
      )}
      {session && !accepted && <button className="wide-action" disabled={working} onClick={acceptInvite}>{working ? <Loader2 className="spin" /> : <ArrowUpRight />}Accept invite</button>}
      {session && !accepted && <p>Signed in as {session.user.email}. <button type="button" disabled={working} onClick={() => void switchAccount()}>Use a different account</button></p>}
      {(message || error) && <p className={error ? "status-line is-error" : "status-line"}>{error || message}</p>}
    </main>
  );
}
