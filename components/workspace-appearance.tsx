"use client";
import { useState } from "react";
import { JourneyAppearanceEditor } from "./journey-appearance-editor";
import { normalizeAppearance } from "@/lib/journey-appearance";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export function WorkspaceAppearance({ workspaceId, value, onSaved }: { workspaceId: string; value: unknown; onSaved: () => void }) {
  const [draft, setDraft] = useState(() => normalizeAppearance(value));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setSaving(true); setMessage("");
    try {
      const session = await createBrowserSupabaseClient()?.auth.getSession();
      if (!session?.data.session) throw new Error("Sign in again to save.");
      const response = await fetch(`/api/workspaces/${workspaceId}/appearance`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session.access_token}` }, body: JSON.stringify({ appearance: draft }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save.");
      setMessage("Defaults saved. Existing journeys are unchanged."); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save."); }
    finally { setSaving(false); }
  }
  return <section className="sage-panel"><h2>Defaults for new journeys</h2><p>Start new journeys with these settings. Each journey can have its own appearance.</p><fieldset disabled={saving} style={{ border: 0, padding: 0 }}><JourneyAppearanceEditor value={draft} onChange={setDraft} /></fieldset><button disabled={saving} onClick={save}>{saving ? "Saving..." : "Save defaults"}</button><p role="status">{message}</p></section>;
}
