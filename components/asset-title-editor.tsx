"use client";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { JourneyAsset } from "./trust-app-shared";

export function AssetTitleEditor({ asset, workspaceId, onSaved }: { asset: JourneyAsset; workspaceId: string; onSaved: (title: string, metadata: any) => void }) {
  const [title, setTitle] = useState(asset.title);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <form className="context-form" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const session = await createBrowserSupabaseClient()?.auth.getSession();
      if (!session?.data.session) throw Error("Sign in again to edit this title.");
      const response = await fetch("/api/library-title", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session.access_token}` }, body: JSON.stringify({ workspaceId, id: asset.videoId || asset.libraryAssetId, kind: asset.videoId ? "video" : "asset", title }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Could not save the title.");
      onSaved(result.title, result.metadata); setMessage("Title saved. The original file is unchanged.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save the title."); }
    finally { setBusy(false); }
  }}><label>Display title<input value={title} maxLength={250} required onChange={event => setTitle(event.target.value)} /></label><button disabled={busy || !title.trim()}>{busy ? "Saving..." : "Save title"}</button><small>Used when adding this asset to a journey. Existing journey titles can be edited separately.</small>{message && <p role="status">{message}</p>}</form>;
}
