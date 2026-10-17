"use client";

import { useEffect, useRef, useState } from "react";
import { Cloud, Plus } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type StorageState = { connection: null | { account_label: string; folder_id: string; folder_name: string; status: string }; canManage: boolean; canUpload: boolean };
export async function storageRequest(path: string, method = "GET", body?: object | FormData) {
  const session = await createBrowserSupabaseClient()?.auth.getSession();
  if (!session?.data.session) throw Error("Sign in again to access photo storage.");
  const multipart = body instanceof FormData;
  const response = await fetch(path, { method, headers: { Authorization: `Bearer ${session.data.session.access_token}`, ...(!multipart ? { "Content-Type": "application/json" } : {}) }, body: body ? multipart ? body : JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Photo storage is unavailable.");
  return result;
}

export function WorkspacePhotoStorage({ workspaceId, settings = false, onUploaded }: { workspaceId: string; settings?: boolean; onUploaded?: () => void | Promise<void> }) {
  const [state, setState] = useState<StorageState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [later, setLater] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingPanel, setUploadingPanel] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [share, setShare] = useState(false);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const alive = useRef(true);
  const endpoint = `/api/workspace-storage?workspaceId=${encodeURIComponent(workspaceId)}`;
  useEffect(() => {
    alive.current = true;
    let active = true;
    storageRequest(endpoint).then(value => { if (active) setState(value); }).catch(e => { if (active) setError(e.message); });
    try { setLater(localStorage.getItem(`photo-storage-later:${workspaceId}`) === "yes"); } catch {}
    const params = new URLSearchParams(window.location.search);
    if (params.has("storage_error")) setError(params.get("storage_error") || "Connection failed.");
    return () => { active = false; alive.current = false; };
  }, [endpoint, workspaceId]);

  async function action(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); } finally { setBusy(false); }
  }
  function connect() { void action(async () => {
    const result = await storageRequest("/api/workspace-storage/connect", "POST", { workspaceId });
    window.location.assign(result.authUrl);
  }); }
  async function upload() {
    setUploading(true); setError("");
    const failed: File[] = [];
    const problems: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        if (!alive.current) break;
        const file = files[i];
        setNotice(`Saving photo ${i + 1} of ${files.length} to Google Drive...`);
        try {
          const optimized = await optimizePhoto(file);
          const form = new FormData(); form.set("file", optimized); form.set("sharingConsent", "true");
          await storageRequest(`/api/workspace-storage/upload?workspaceId=${encodeURIComponent(workspaceId)}`, "POST", form);
        } catch (e) { failed.push(file); problems.push(`${file.name}: ${e instanceof Error ? e.message : "Upload failed"}`); }
      }
      if (!alive.current) return;
      setFiles(failed); setNotice(failed.length ? `${files.length - failed.length} saved. Retry the remaining photos below.` : "Photos saved to your workspace library and Google Drive.");
      setError(problems.join("\n"));
      if (onUploaded) await onUploaded();
      setState(await storageRequest(endpoint));
    } finally { if (alive.current) setUploading(false); }
  }
  const connection = state?.connection;
  const pending = !state && !error;
  return <section className="sage-panel sage-storage-card" aria-label="Photo storage">
    <div className="sage-section-heading"><div><span className="sage-eyebrow">{connection ? "Photo storage" : "Workspace setup"}</span><h2><Cloud size={22} />{connection ? "Your photos, in your Drive." : "Where should we save your photos?"}</h2></div>
      {connection && state?.canUpload && <button className="sage-primary" disabled={busy || uploading} onClick={() => setUploadingPanel(value => !value)}><Plus />Add photos</button>}
    </div>
    {pending ? <p role="status">Checking photo storage...</p> : connection ? <><p>Google Drive · {connection.account_label} · <a href={`https://drive.google.com/drive/folders/${connection.folder_id}`} target="_blank" rel="noreferrer">{connection.folder_name}</a></p>{connection.status === "reconnect_required" && <p role="alert">Reconnect Google Drive to resume uploads. {state?.canManage ? <button onClick={connect} disabled={busy}>Reconnect</button> : "Ask your workspace admin to reconnect."}</p>}</> : state && <>
      {(!later || settings) && <p>Connect Google Drive once for this workspace. Members who can add content can save photos here without connecting their own account. Photo files stay in your Drive, not TrustTale storage.</p>}
      <div className="sage-actions">{state.canManage ? <button className="sage-primary" onClick={connect} disabled={busy}>{busy ? "Connecting..." : "Connect Google Drive"}</button> : <p>Ask a workspace admin to connect Google Drive.</p>}
        {!settings && !later && <button onClick={() => { setLater(true); try { localStorage.setItem(`photo-storage-later:${workspaceId}`, "yes"); } catch {} }}>Set up later</button>}
      </div>{!later && <small>You can keep using video and document links without connecting storage.</small>}
    </>}
    {connection && settings && state?.canManage && <div className="sage-actions">
      <button disabled={busy} onClick={connect}>Reconnect or change account</button>
      <button disabled={busy} onClick={() => void action(async () => { const result = await storageRequest(`${endpoint}&folders=1`); setFolders(result.folders); })}>Change folder</button>
      <button disabled={busy || uploading} onClick={() => { if (window.confirm("Disconnect uploads for this workspace? Existing files and shared links remain in Google Drive.")) void action(async () => { await storageRequest(endpoint, "DELETE", { workspaceId }); setState(await storageRequest(endpoint)); }); }}>Disconnect</button>
    </div>}
    {settings && folders.length > 0 && <label>Destination folder (folders already accessible to TrustTale)<select value={connection?.folder_id || ""} disabled={busy} onChange={e => { const folderId = e.target.value; void action(async () => { await storageRequest(endpoint, "PATCH", { workspaceId, folderId }); setState(await storageRequest(endpoint)); }); }}><option value="" disabled>Choose folder</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>}
    {connection && state?.canUpload && uploadingPanel && <div className="sage-photos-import">
      <label>Choose photos from your phone or computer<input type="file" accept="image/*" multiple disabled={uploading} onChange={event => { const selected = Array.from(event.target.files || []); setFiles(selected.slice(0,100)); setNotice(selected.length > 100 ? "The first 100 photos were selected. Add more in another batch." : ""); }} /></label>
      <p>{files.length ? `${files.length} photos selected` : "On iPhone, choose Photo Library or Browse for iCloud Drive files."}</p>
      <label className="sage-photos-consent"><input type="checkbox" checked={share} disabled={uploading} onChange={e => setShare(e.target.checked)} />I can share these photos with customers. Enable anyone-with-link viewing on the uploaded Drive copies.</label>
      <button className="sage-primary" disabled={uploading || !share || !files.length} onClick={() => void upload().catch(e => setError(e.message))}>{uploading ? "Saving photos..." : "Save photos to library"}</button>
      <small>Keep this page open until uploading finishes. Originals are unchanged; optimized copies go to the workspace Drive.</small>
    </div>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert" style={{ whiteSpace: "pre-wrap" }}>{error}</p>}
  </section>;
}

async function optimizePhoto(file: File) {
  if (file.size > 40 * 1024 * 1024) throw Error("Choose an image under 40 MB.");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw Error("This image format could not be read. Export it as JPEG or PNG and try again."); }
  try {
    const ratio = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext("2d"); if (!context) throw Error("Image processing is unavailable in this browser.");
    context.fillStyle = "white"; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error("Could not prepare photo.")), "image/jpeg", 0.82));
    if (blob.size > 3500000) throw Error("Photo is still too large after resizing. Choose a smaller image.");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } finally { bitmap.close(); }
}
