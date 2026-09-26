"use client";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
export function ReviewSessionBanner({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    const db = createBrowserSupabaseClient();
    let active = true;
    const tick = async () => {
      if (!active) return;
      const milliseconds = Date.parse(expiresAt) - Date.now();
      if (!Number.isFinite(milliseconds) || milliseconds <= 0) { await db?.auth.signOut({ scope: "local" }); return; }
      setRemaining(`${Math.ceil(milliseconds / 60000)} minutes remaining`);
      try {
        const session = (await db?.auth.getSession())?.data.session;
        if (!session) return;
        const response = await fetch("/api/review/status", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        if (active && [401, 403].includes(response.status)) await db?.auth.signOut({ scope: "local" });
      } catch { /* Server and database still enforce expiry if the browser is offline. */ }
    };
    void tick();
    const timer = setInterval(() => void tick(), 30000);
    return () => { active = false; clearInterval(timer); };
  }, [expiresAt]);
  return <div className="library-refresh" role="status"><strong>Read-only review: Unmarked</strong><span>{remaining}. Changes and automatic imports are disabled.</span></div>;
}
