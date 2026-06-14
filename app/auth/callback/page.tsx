"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [message, setMessage] = useState("Finishing sign in.");

  useEffect(() => {
    let cancelled = false;

    async function finishAuth() {
      if (!supabase) {
        setMessage("Supabase is not configured.");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const next = params.get("next") || "/";
      const errorDescription = params.get("error_description") || hashParams.get("error_description");

      if (errorDescription) {
        setMessage(errorDescription);
        return;
      }

      // Give supabase-js first pass. It can persist sessions from OAuth URL hash
      // returns without us accidentally exchanging a provider-owned Google code.
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      const { data: initialSession } = await supabase.auth.getSession();

      if (initialSession.session) {
        if (!cancelled) window.location.replace(next);
        return;
      }

      const code = params.get("code");
      const isExternalGoogleCode = code?.startsWith("4/") || code?.startsWith("4%2F");

      if (code && !isExternalGoogleCode) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setMessage(error.message);
          return;
        }

        if (!cancelled) window.location.replace(next);
        return;
      }

      if (hashParams.get("access_token")) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const { data: hashSession } = await supabase.auth.getSession();
        if (hashSession.session) {
          if (!cancelled) window.location.replace(next);
          return;
        }
      }

      if (isExternalGoogleCode) {
        setMessage("Google returned to the app before Supabase completed the login. Check the Google OAuth redirect URI and make sure Supabase uses its own callback URL.");
        return;
      }

      setMessage("No sign-in session was returned. Try signing in again.");
    }

    finishAuth();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <main className="role-gate auth-first-screen">
      <section className="gate-intro">
        <span>Trust Compression</span>
        <h1>{message}</h1>
        <p>Hold tight while your secure session is connected.</p>
      </section>
      <Loader2 className="spin" />
    </main>
  );
}
