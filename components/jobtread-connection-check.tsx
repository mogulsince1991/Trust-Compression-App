"use client";

import { useState } from "react";

export function JobTreadConnectionCheck({ workspaceId, accountId, token }: { workspaceId: string; accountId: string; token: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; error: boolean } | null>(null);
  async function check() {
    setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/connect/jobtread/check", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ workspaceId, connectedAccountId: accountId }) });
      const data = await response.json();
      setResult({ text: data.error || `${data.message} Checked ${new Date(data.checkedAt).toLocaleString()}.`, error: !response.ok });
    } catch { setResult({ text: "Could not complete the connection check. Please try again.", error: true }); }
    finally { setBusy(false); }
  }
  return <div><button type="button" disabled={busy} onClick={check}>{busy ? "Checking JobTread..." : "Check JobTread connection"}</button>{result && <p role={result.error ? "alert" : "status"}>{result.text}</p>}</div>;
}
