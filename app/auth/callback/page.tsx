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

      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setMessage(error.message);
          return;
        }
      } else {
        const { data } = await supabase.auth.getSession();
        if (!data.session && !hashParams.get("access_token")) {
          setMessage("No sign-in session was returned. Try signing in again.");
          return;
        }
      }

      if (!cancelled) window.location.replace(next);
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
