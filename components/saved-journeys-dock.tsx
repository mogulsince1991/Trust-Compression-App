"use client";

import { Archive, ExternalLink, ImageIcon, Link2, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type SavedJourney = {
  id: string;
  title: string;
  heading: string | null;
  description: string | null;
  shareToken: string;
  shareUrl: string;
  createdAt: string;
  publishedAt: string | null;
  isPublic: boolean;
};

export function SavedJourneysDock() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [journeys, setJourneys] = useState<SavedJourney[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setJourneys([]);
        setOpen(false);
      }
    });

    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session) return;

    let active = true;

    async function loadSavedLinks() {
      setLoading(true);
      setError("");

      const { data: workspaceId, error: workspaceError } = await supabase.rpc("ensure_workspace", {
        workspace_name: "Trust Library"
      });

      if (!active) return;
      if (workspaceError || !workspaceId) {
        setError(workspaceError?.message ?? "Could not open workspace links.");
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/journeys?workspaceId=${encodeURIComponent(workspaceId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const result = (await response.json()) as { journeys?: SavedJourney[]; error?: string };

      if (!active) return;
      if (!response.ok) {
        setError(result.error ?? "Could not load saved journey links.");
      } else {
        setJourneys(result.journeys ?? []);
      }
      setLoading(false);
    }

    void loadSavedLinks();

    return () => {
      active = false;
    };
  }, [session, supabase]);

  if (!session) return null;

  return (
    <aside style={dockStyle} aria-label="Library utilities">
      {open && (
        <section style={panelStyle}>
          <div style={headStyle}>
            <span style={eyebrowStyle}>Saved links</span>
            <button style={iconStyle} onClick={() => setOpen(false)} aria-label="Close saved links">
              <X size={16} />
            </button>
          </div>
          {loading && (
            <p style={mutedStyle}>
              <Loader2 size={15} className="spin" /> Loading links
            </p>
          )}
          {error && <p style={errorStyle}>{error}</p>}
          {!loading && !error && !journeys.length && <p style={mutedStyle}>Published journey links will appear here on every device after sign in.</p>}
          <div style={listStyle}>
            {journeys.map((journey) => (
              <a key={journey.id} href={journey.shareUrl} target="_blank" rel="noreferrer" style={linkStyle}>
                <span style={titleStyle}>{journey.title || journey.heading || "Untitled journey"}</span>
                <small style={smallStyle}>{new Date(journey.createdAt).toLocaleDateString()} / {journey.isPublic ? "Public link" : "Draft"}</small>
                <ExternalLink size={15} style={{ flex: "0 0 auto" }} />
              </a>
            ))}
          </div>
        </section>
      )}
      <div style={buttonRowStyle}>
        <button style={buttonStyle} onClick={() => setOpen((current) => !current)}>
          <Link2 size={16} />
          Links
          {journeys.length > 0 && <span style={countStyle}>{journeys.length}</span>}
        </button>
        <a style={buttonStyle} href="/archive">
          <Archive size={16} />
          Journeys
        </a>
        <a style={buttonStyle} href="/video-overrides">
          <ImageIcon size={16} />
          Videos
        </a>
      </div>
    </aside>
  );
}

const dockStyle = {
  position: "fixed" as const,
  left: "50%",
  bottom: 14,
  transform: "translateX(-50%)",
  zIndex: 60,
  width: "max-content",
  maxWidth: "calc(100vw - 24px)",
  display: "grid",
  gap: 8,
  justifyItems: "center"
};

const buttonRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: 4,
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 999,
  background: "rgba(7,7,7,.7)",
  backdropFilter: "blur(18px)",
  boxShadow: "0 16px 54px rgba(0,0,0,.34)"
};

const buttonStyle = {
  height: 38,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "0 12px",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 999,
  color: "#f6f3ee",
  background: "rgba(255,255,255,.055)",
  textDecoration: "none",
  fontSize: 14
};

const panelStyle = {
  width: 360,
  maxWidth: "calc(100vw - 24px)",
  maxHeight: "min(520px, calc(100vh - 90px))",
  overflow: "auto",
  padding: 14,
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 8,
  color: "#f6f3ee",
  background: "rgba(7,7,7,.94)",
  backdropFilter: "blur(22px)",
  boxShadow: "0 24px 80px rgba(0,0,0,.42)"
};

const headStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  paddingBottom: 12,
  borderBottom: "1px solid rgba(255,255,255,.08)"
};

const eyebrowStyle = {
  color: "#8e8a83",
  fontSize: 11,
  textTransform: "uppercase" as const,
  letterSpacing: ".13em"
};

const iconStyle = {
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  border: 0,
  color: "#8e8a83",
  background: "transparent"
};

const listStyle = {
  display: "grid",
  gap: 1,
  marginTop: 10
};

const linkStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) auto",
  gap: "4px 10px",
  alignItems: "center",
  padding: "12px 2px",
  color: "#f6f3ee",
  textDecoration: "none",
  borderBottom: "1px solid rgba(255,255,255,.08)"
};

const titleStyle = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
  fontSize: 14
};

const smallStyle = {
  gridColumn: "1 / -1",
  color: "#8e8a83",
  fontSize: 12
};

const mutedStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  margin: "12px 0 0",
  color: "rgba(246,243,238,.66)",
  fontSize: 13,
  lineHeight: 1.45
};

const errorStyle = {
  margin: "12px 0 0",
  color: "#ffd4d4",
  fontSize: 13,
  lineHeight: 1.45
};

const countStyle = {
  minWidth: 20,
  height: 20,
  display: "grid",
  placeItems: "center",
  padding: "0 6px",
  borderRadius: 999,
  color: "#080808",
  background: "#f6f3ee",
  fontSize: 12
};
