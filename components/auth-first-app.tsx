"use client";

import { ArrowUpRight, Loader2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { AppearanceControl } from "./sage-shell";
import { TrustAppIngestion } from "@/components/trust-app-ingestion";

const noMagicLinkEmails = new Set(["admin@unmarked.media"]);

function getAuthRedirectUrl() {
  return `${window.location.origin}/auth/callback`;
}

type AppView = import("./trust-app-shell").ViewId;

export function AuthFirstApp({
  initialView = "home",
  initialSocialProfileReportId = null,
}: {
  initialView?: AppView;
  initialSocialProfileReportId?: string | null;
} = {}) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [mode, setMode] = useState<"password" | "link" | "signup">("password");

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    let authChanged = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!active || authChanged) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authChanged = true;
      setSession(nextSession);
      setLoading(false);
    });

    return () => { active = false; data.subscription.unsubscribe(); };
  }, [supabase]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !email) return;
    setWorking(true);
    setMessage("");
    setError("");

    if (mode === "signup") { setWorking(false); await createAccount(); return; }
    if (mode === "password") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setWorking(false);
      if (signInError) setError(signInError.message);
      return;
    }

    if (noMagicLinkEmails.has(email.trim().toLowerCase())) {
      setWorking(false);
      setError("Use password login for this admin account. No magic-link email was sent.");
      return;
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: getAuthRedirectUrl(), shouldCreateUser: false }
    });
    setWorking(false);
    if (otpError) setError(otpError.message);
    else setMessage("Check your email. The sign-in link has been sent.");
  }

  async function createAccount() {
    if (!supabase || !email || password.length < 6) {
      setError("Enter an email and a password with at least 6 characters to create an account.");
      return;
    }

    setWorking(true);
    setMessage("");
    setError("");
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: getAuthRedirectUrl() }
    });
    setWorking(false);

    if (signUpError) setError(signUpError.message);
    else setMessage("Account created. If email confirmation is enabled, check your inbox before signing in.");
  }

  async function signInWithGoogle() {
    if (!supabase) return;
    setWorking(true);
    setMessage("");
    setError("");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: getAuthRedirectUrl(), queryParams: { prompt: "select_account" } }
    });
    setWorking(false);
    if (oauthError) setError(oauthError.message);
  }

  if (loading) return <main className="role-gate"><Loader2 className="spin" /><h1>Opening workspace.</h1></main>;
  if (session) return <TrustAppIngestion key={session.user.id} initialView={initialView} initialSocialProfileReportId={initialSocialProfileReportId} />;

  return (
    <div className="sage-app sage-auth">
      <header className="sage-auth-header"><a className="sage-wordmark" href="/">TrustTale<span className="sage-brand-dot" /></a><AppearanceControl /></header>
      <main className="sage-auth-layout">
        <section className="sage-auth-intro"><span className="sage-eyebrow">Proof. Ready to share.</span><h1>Turn your best work into your next conversation.</h1><p>Bring together videos, project stories, and documents. Share the right proof with each buyer, and see what connects.</p><div className="sage-auth-example"><span className="sage-badge is-live">A more confident buyer</span><h2>Show them.<br />Don't just tell them.</h2><p>One focused journey. Everything they need to take the next step.</p></div></section>
        <form className="sage-panel sage-auth-card" onSubmit={signIn}>
          <h2>{mode === "signup" ? "Create your account" : mode === "link" ? "Email me a sign-in link" : "Welcome back"}</h2>
          <p>{mode === "signup" ? "Your company's proof, all in one place." : "Sign in to your workspace."}</p>
          <button type="button" disabled={working} onClick={signInWithGoogle}>Continue with Google <ArrowUpRight /></button>
          <div className="sage-auth-divider">or use email</div>
          <label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required /></label>
          {mode !== "link" && <label>Password<input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} minLength={mode === "signup" ? 6 : undefined} required /></label>}
          <button className="sage-primary" disabled={working} type="submit">{working ? "Please wait..." : mode === "signup" ? "Create account" : mode === "link" ? "Send sign-in link" : "Sign in"}<ArrowUpRight /></button>
          {mode === "password" && <button type="button" className="sage-auth-switch" onClick={() => { setMode("link"); setError(""); setMessage(""); }}>Sign in with an email link instead</button>}
          <button type="button" className="sage-auth-switch" onClick={() => { setMode(mode === "signup" || mode === "link" ? "password" : "signup"); setError(""); setMessage(""); }}>{mode === "signup" || mode === "link" ? "Back to sign in" : "New to TrustTale? Create an account"}</button>
          {(message || error) && <p className="sage-notice" role={error ? "alert" : "status"}>{error || message}</p>}
        </form>
      </main>
    </div>
  );
}
