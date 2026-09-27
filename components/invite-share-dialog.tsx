"use client";
import { useEffect, useRef, useState } from "react";

export function InviteShareDialog({ invite, onClose }: { invite: { email: string; inviteUrl: string; expires_at?: string }; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, []);
  const text = `You've been invited to a TrustTale workspace. Open ${invite.inviteUrl} and sign in with ${invite.email} to join.`;
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage("Copied. Paste it into your email or text message."); }
    catch { setMessage("Copy was unavailable. Select and copy the link below."); }
  }
  return <dialog ref={dialog} className="sage-panel" style={{ width: "min(560px, calc(100vw - 32px))", maxHeight: "85dvh", overflow: "auto" }} aria-labelledby="invite-share-title" onCancel={onClose}>
    <h2 id="invite-share-title">Send this invitation link</h2>
    <p><strong>{invite.email}</strong> is now on this workspace's invitation list. <strong>No invitation email has been sent.</strong></p>
    <p>Copy the link and send it yourself. The recipient must sign in with this exact email address, using Google or email sign-in.</p>
    <label>Invitation link<input style={{ width: "100%" }} readOnly value={invite.inviteUrl} onFocus={event => event.target.select()} /></label>
    {invite.expires_at && <p>Expires {new Date(invite.expires_at).toLocaleDateString()}.</p>}
    <button type="button" onClick={() => void copy(invite.inviteUrl)}>Copy link</button>
    <button type="button" onClick={() => void copy(text)}>Copy link and message</button>
    <p role="status">{message}</p>
    <button type="button" onClick={onClose}>Done</button>
  </dialog>;
}
