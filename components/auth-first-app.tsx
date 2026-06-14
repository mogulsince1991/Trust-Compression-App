"use client";

import { ArrowUpRight, Loader2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { TrustAppIngestion } from "@/components/trust-app-ingestion";

const noMagicLinkEmails = new Set(["admin@unmarked.media"]);

function getAuthRedirectUrl() {
  return `${window.location.origin}/auth/callback?next=/`;
}

export function AuthFirstApp() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => {
      const cards = Array.from(document.querySelectorAll<HTMLButtonElement>(".role-card"));
      const ownerCard = cards.find((card) => card.textContent?.includes("Owner"));
      const libraryCard = cards.find((card) => card.textContent?.includes("Library Manager"));
      (ownerCard ?? libraryCard ?? cards[0])?.click();
    }, 60);

    return () => window.clearTimeout(timer);
  }, [session]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !email) return;
    setWorking(true);
    setMessage("");
    setError("");

    if (password.length >= 6) {
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
      options: { emailRedirectTo: getAuthRedirectUrl() }
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
      options: { redirectTo: getAuthRedirectUrl() }
    });
    setWorking(false);
    if (oauthError) setError(oauthError.message);
  }

  if (loading) return <main className="role-gate"><Loader2 className="spin" /><h1>Opening workspace.</h1></main>;
  if (session) return <TrustAppIngestion />;

  return (
    <main className="role-gate auth-first-screen">
      <section className="gate-intro">
        <span>Trust Compression</span>
        <h1>Sign in to your company library.</h1>
        <p>Your workspace controls your role and permissions. Create an account, use Google, or sign in with email.</p>
      </section>
      <form className="prospect-brief auth-card" onSubmit={signIn}>
        <button className="wide-action auth-google" type="button" disabled={working} onClick={signInWithGoogle}>{working ? <Loader2 className="spin" /> : <ArrowUpRight />}Continue with Google</button>
        <div className="auth-divider"><span>or</span></div>
        <div className="brief-grid">
          <label className="wide-field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label>
          <label className="wide-field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password or leave blank for magic link" /></label>
        </div>
        <div className="auth-actions">
          <button className="wide-action" disabled={working} type="submit">{working ? <Loader2 className="spin" /> : <ArrowUpRight />}Sign in</button>
          <button className="seed-button" disabled={working} type="button" onClick={createAccount}>Create account</button>
        </div>
        <p className="auth-hint">Leave password blank to receive a magic link. Use a password to create an account or sign in directly.</p>
        {(message || error) && <p className={error ? "status-line is-error" : "status-line"}>{error || message}</p>}
      </form>
    </main>
  );
}
