"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type Diagnostic = {
  status: "loading" | "success" | "error";
  title: string;
  detail: string;
  evidence?: string;
  fix?: string[];
};

export default function AuthCallbackPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [diagnostic, setDiagnostic] = useState<Diagnostic>({
    status: "loading",
    title: "Finishing sign in.",
    detail: "Hold tight while your secure session is connected."
  });

  useEffect(() => {
    let cancelled = false;

    async function finishAuth() {
      if (!supabase) {
        setDiagnostic({
          status: "error",
          title: "Supabase is not configured.",
          detail: "The app cannot create a Supabase browser client."
        });
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const next = sanitizeNext(params.get("next") || "/");
      const errorDescription = params.get("error_description") || hashParams.get("error_description");
      const errorCode = params.get("error") || hashParams.get("error");
      const code = params.get("code");
      const hasHashAccessToken = Boolean(hashParams.get("access_token"));
      const isExternalGoogleCode = code?.startsWith("4/") || code?.startsWith("4%2F");

      if (errorDescription || errorCode) {
        setDiagnostic({
          status: "error",
          title: "Google or Supabase returned an auth error.",
          detail: errorDescription || errorCode || "Unknown auth error.",
          evidence: window.location.href,
          fix: [
            "Confirm the Google OAuth consent screen is External or your account is added as a test user.",
            "Confirm Supabase Authentication > Providers > Google is enabled with the same Google Client ID and Secret.",
            "Confirm Supabase Authentication > URL Configuration allows https://trustcompression.unmarked.media/auth/callback."
          ]
        });
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 250));
      const { data: initialSession } = await supabase.auth.getSession();

      if (initialSession.session) {
        setDiagnostic({
          status: "success",
          title: "Signed in.",
          detail: "Redirecting to your workspace."
        });
        if (!cancelled) window.location.replace(next);
        return;
      }

      if (code && isExternalGoogleCode) {
        setDiagnostic({
          status: "error",
          title: "Google is still returning directly to the app.",
          detail: "This is a raw Google OAuth code. Supabase cannot exchange it from this page.",
          evidence: `Callback received code starting with ${code.slice(0, 6)}...`,
          fix: [
            "In Google Cloud, edit the OAuth Client ID that is saved inside Supabase, not a different Google client.",
            "That Google client should have Authorized redirect URI: https://boswlaonbdxugkocquzv.supabase.co/auth/v1/callback",
            "In Supabase, Authentication > Providers > Google must use that exact same Google Client ID and Client Secret.",
            "Remove app-owned Google callback URLs until the Drive/YouTube connector route is built."
          ]
        });
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setDiagnostic({
            status: "error",
            title: "Supabase could not exchange the auth code.",
            detail: error.message,
            evidence: `Callback received a non-Google code beginning with ${code.slice(0, 8)}...`,
            fix: [
              "Confirm this exact URL is in Supabase Redirect URLs: https://trustcompression.unmarked.media/auth/callback",
              "Confirm Supabase Site URL is https://trustcompression.unmarked.media",
              "Try again in a fresh browser tab after saving Supabase Auth settings."
            ]
          });
          return;
        }

        setDiagnostic({
          status: "success",
          title: "Signed in.",
          detail: "Redirecting to your workspace."
        });
        if (!cancelled) window.location.replace(next);
        return;
      }

      if (hasHashAccessToken) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const { data: hashSession } = await supabase.auth.getSession();
        if (hashSession.session) {
          setDiagnostic({
            status: "success",
            title: "Signed in.",
            detail: "Redirecting to your workspace."
          });
          if (!cancelled) window.location.replace(next);
          return;
        }
      }

      setDiagnostic({
        status: "error",
        title: "No sign-in session was returned.",
        detail: "The callback loaded, but it did not include a Supabase session, access token, or exchangeable auth code.",
        evidence: window.location.href,
        fix: [
          "Start from the Trust Compression sign-in button again, not a bookmarked Google URL.",
          "Confirm Supabase Google provider is enabled and saved.",
          "Confirm Supabase Redirect URLs include https://trustcompression.unmarked.media/auth/callback."
        ]
      });
    }

    finishAuth();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const Icon = diagnostic.status === "error" ? AlertCircle : diagnostic.status === "success" ? CheckCircle2 : Loader2;

  return (
    <main className="role-gate auth-first-screen">
      <section className="gate-intro auth-callback-diagnostic">
        <span>Trust Compression</span>
        <h1>{diagnostic.title}</h1>
        <p>{diagnostic.detail}</p>
        {diagnostic.evidence && <pre>{diagnostic.evidence}</pre>}
        {diagnostic.fix?.length ? (
          <ul>
            {diagnostic.fix.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        <a href="/">Back to sign in</a>
      </section>
      <Icon className={diagnostic.status === "loading" ? "spin" : ""} />
    </main>
  );
}

function sanitizeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
