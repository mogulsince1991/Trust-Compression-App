"use client";

import { ArrowUpRight, Loader2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { TrustAppIngestion } from "@/components/trust-app-ingestion";

const noMagicLinkEmails = new Set(["admin@unmarked.media"]);

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

    const { error: otpError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setWorking(false);
    if (otpError) setError(otpError.message);
    else setMessage("Check your email. The sign-in link has been sent.");
  }

  if (loading) return <main className="role-gate"><Loader2 className="spin" /><h1>Opening workspace.</h1></main>;
  if (session) return <TrustAppIngestion />;

  return (
    <main className="role-gate auth-first-screen">
      <section className="gate-intro">
        <span>Trust Library</span>
        <h1>Sign in to your company library.</h1>
        <p>Your role and permissions should come from the workspace, not from choosing a persona before you log in.</p>
      </section>
      <form className="prospect-brief" onSubmit={signIn}>
        <div className="brief-grid">
          <label className="wide-field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label>
          <label className="wide-field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password or leave blank for magic link" /></label>
        </div>
        <button className="wide-action" disabled={working}>{working ? <Loader2 className="spin" /> : <ArrowUpRight />}Continue</button>
        {(message || error) && <p className={error ? "status-line is-error" : "status-line"}>{error || message}</p>}
      </form>
    </main>
  );
}
