"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type Photo = { id: string; name: string; ticket: string; result?: string; error?: string };
type TokenResponse = { access_token?: string; error?: string; expires_in?: number };
type GoogleIdentity = { accounts: { oauth2: { initTokenClient: (config: { client_id: string; scope: string; callback: (response: TokenResponse) => void; error_callback: () => void }) => { requestAccessToken: () => void } } } };

export function GooglePhotosImport({ workspaceId, onImported }: { workspaceId: string; onImported: () => void | Promise<void> }) {
  const [clientId, setClientId] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [picker, setPicker] = useState<{ sessionId: string; pickerUri: string } | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const googleToken = useRef("");
  const mounted = useRef(true);
  const running = useRef(false);
  useEffect(() => {
    mounted.current = true;
    void api().then(data => { if (mounted.current) setClientId(data.clientId); }).catch(error => { if (mounted.current) setMessage(error.message); });
    return () => { mounted.current = false; googleToken.current = ""; };
  }, [workspaceId]);

  async function api(body?: object) {
    const session = await createBrowserSupabaseClient()?.auth.getSession();
    if (!session?.data.session) throw Error("Sign in again to import photos.");
    const response = await fetch(`/api/import/google-photos?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session.access_token}` },
      body: body ? JSON.stringify({ ...body, workspaceId, googleToken: googleToken.current }) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "Could not import Google Photos.");
    return result;
  }

  function connect() {
    if (running.current) return;
    const google = (window as Window & { google?: GoogleIdentity }).google;
    if (!google) { setMessage("Google sign-in could not load. Check your connection or browser blocker."); return; }
    running.current = true; setBusy(true); setMessage(""); setPhotos([]);
    google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: "https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
      error_callback: () => { running.current = false; if (mounted.current) { setBusy(false); setMessage("Google sign-in was closed or blocked. Try connecting again."); } },
      callback: async response => {
        try {
          if (!mounted.current) return;
          if (!response.access_token || response.error) throw Error("Google Photos permission was not granted.");
          googleToken.current = response.access_token;
          const data = await api({ action: "create" });
          const url = new URL(data.pickerUri);
          if (url.protocol !== "https:" || url.hostname !== "photos.google.com") throw Error("Google returned an unexpected picker address.");
          if (mounted.current) { setPicker(data); setMessage("Open Google Photos below, select your photos, then return here and load your selection."); }
        } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : "Could not connect."); }
        finally { running.current = false; if (mounted.current) setBusy(false); }
      },
    }).requestAccessToken();
  }

  async function loadSelection() {
    if (running.current || !picker) return;
    running.current = true; setBusy(true); setMessage("");
    try {
      const result = await api({ action: "list", sessionId: picker.sessionId });
      if (!mounted.current) return;
      if (result.pending) { setMessage("Finish selecting in Google Photos and press Done, then try again."); return; }
      setPhotos(result.photos);
      setMessage(`${result.photos.length} photos ready.${result.skipped ? ` ${result.skipped} videos skipped; add videos using Drive or YouTube instead.` : ""}`);
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : "Could not load photos."); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }

  async function importPhotos() {
    if (running.current || !consent) return;
    running.current = true; setBusy(true);
    const pending = photos.filter(photo => !photo.result);
    let failed = 0;
    let completed = 0;
    try {
      for (const photo of pending) {
        if (!mounted.current) break;
        setMessage(`Importing ${++completed} of ${pending.length}: ${photo.name}`);
        try {
          const result = await api({ action: "import", ticket: photo.ticket, consent });
          if (mounted.current) setPhotos(current => current.map(p => p.id === photo.id ? { ...p, result: result.status, error: undefined } : p));
        } catch (error) {
          failed++;
          if (mounted.current) setPhotos(current => current.map(p => p.id === photo.id ? { ...p, error: error instanceof Error ? error.message : "Import failed." } : p));
        }
      }
      if (mounted.current) await onImported();
      if (mounted.current) setMessage(failed ? `${failed} photos could not be imported. Review the errors below and retry.` : "Photos are in your library. Existing photos were not duplicated.");
      if (!failed && mounted.current && picker) {
        await api({ action: "close", sessionId: picker.sessionId }).catch(() => {});
        googleToken.current = ""; setPicker(null);
      }
    } catch { if (mounted.current) setMessage("Photos were saved, but the library could not refresh. Reopen the library to see them."); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }

  return <div className="sage-photos-import">
    <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setScriptReady(true)} onError={() => setMessage("Google sign-in failed to load. Check your browser blocker and try again.")} />
    <h3>Import from Google Photos</h3>
    <p>Select up to 100 photos at once. You can search for an album in Google's picker and select the photos you want. This is a one-time import, not automatic album sync.</p>
    <p>TrustTale saves image copies up to 2048 pixels for reliable previews and journeys. Originals stay in Google Photos. Videos are not copied.</p>
    <p className="sage-help">Delete an imported copy from its library preview. Deleting it also stops it displaying in existing journeys; archiving only hides it from the library. Google access is temporary and is not saved.</p>
    <p className="sage-help">Google Photos data is used for the selected import and sharing features, in accordance with the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google User Data Policy, including Limited Use requirements</a>.</p>
    <label className="sage-photos-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />I have permission to copy these photos into this workspace and share them. Anyone with a photo or journey link can view the imported copy.</label>
    <div className="sage-actions"><button type="button" disabled={!clientId || !scriptReady || busy || !consent} onClick={connect}>{busy ? "Working..." : picker ? "Choose different photos" : "Connect Google Photos"}</button>
      {picker && <><a href={picker.pickerUri} target="_blank" rel="noreferrer">Open Google Photos</a><button type="button" disabled={busy} onClick={loadSelection}>Load selected photos</button></>}
      {photos.some(photo => !photo.result) && <button type="button" className="sage-primary" disabled={busy || !consent} onClick={importPhotos}>Import {photos.filter(photo => !photo.result).length} photos</button>}
    </div>
    {message && <p role="status" aria-live="polite">{message}</p>}
    {busy && <p className="sage-help">Keep this panel open until importing finishes. Already saved photos are kept if you leave.</p>}
    {photos.length > 0 && <ul className="sage-photos-results">{photos.map(photo => <li key={photo.id}><span>{photo.name}</span><small>{photo.error || (photo.result === "existing" ? "Already in library" : photo.result ? "Saved" : "Ready to import")}</small></li>)}</ul>}
  </div>;
}

export function DeleteGooglePhoto({ workspaceId, assetId, onDeleted }: { workspaceId: string; assetId: string; onDeleted: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div><button type="button" className="sage-danger" disabled={busy} onClick={async () => {
    if (!window.confirm("Permanently delete this imported copy? Existing journeys will no longer show it. The original in Google Photos is unchanged.")) return;
    setBusy(true); setError("");
    try {
      const session = await createBrowserSupabaseClient()?.auth.getSession();
      if (!session?.data.session) throw Error("Sign in again to delete this photo.");
      const response = await fetch("/api/import/google-photos", { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session.access_token}` }, body: JSON.stringify({ workspaceId, assetId }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Could not delete photo.");
      await onDeleted();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete photo."); }
    finally { setBusy(false); }
  }}>{busy ? "Deleting..." : "Permanently delete photo copy"}</button>{error && <p role="alert">{error}</p>}</div>;
}
