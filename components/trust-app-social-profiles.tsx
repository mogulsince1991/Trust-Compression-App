"use client";

import { ExternalLink, Facebook, Instagram, Linkedin, Loader2, RefreshCw, Trash2, UserRound, Youtube } from "lucide-react";
import type { FormEvent } from "react";
import { parseMetricSnapshot } from "@/lib/social-profiles";
import { formatDateTime, type SocialProfileDraft, type SocialProfileRow } from "@/components/trust-app-shared";

const PLATFORM_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X" },
  { value: "other", label: "Other" },
] as const;

export function SocialProfilesView({
  draft,
  profiles,
  selectedProfileId,
  working,
  onDraftChange,
  onSave,
  onAnalyze,
  onViewReport,
  onRemove,
}: {
  draft: SocialProfileDraft;
  profiles: SocialProfileRow[];
  selectedProfileId: string | null;
  working: boolean;
  onDraftChange: (draft: SocialProfileDraft) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onAnalyze: (profile: SocialProfileRow) => void;
  onViewReport: (profile: SocialProfileRow) => void;
  onRemove: (profile: SocialProfileRow) => void;
}) {
  const selected = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? null;
  const snapshot = selected ? parseMetricSnapshot(selected.latestCachedMetrics) : null;

  return (
    <section className="social-profiles-shell">
      <section className="social-profiles-column">
        <section className="workflow-panel social-profiles-panel">
          <div className="mini-head">
            <span>Social Profiles</span>
            <strong>{profiles.length} saved</strong>
          </div>
          <div className="tracking-panel-copy">
            <h2>Save social profiles once, then reuse them whenever you want to rerun analysis.</h2>
            <p>Keep the handle, profile URL, and business label attached to the workspace so the team can stop retyping the same inputs over and over.</p>
          </div>
          <form className="brief-grid social-profile-form" onSubmit={onSave}>
            <label>
              <span>Platform</span>
              <select value={draft.platform} onChange={(event) => onDraftChange({ ...draft, platform: event.target.value })}>
                {PLATFORM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Username / handle</span>
              <input value={draft.username} onChange={(event) => onDraftChange({ ...draft, username: event.target.value })} placeholder="@username" />
            </label>
            <label className="wide-field">
              <span>Profile URL</span>
              <input value={draft.profileUrl} onChange={(event) => onDraftChange({ ...draft, profileUrl: event.target.value })} placeholder="https://instagram.com/yourprofile" />
            </label>
            <label>
              <span>Display name</span>
              <input value={draft.displayName} onChange={(event) => onDraftChange({ ...draft, displayName: event.target.value })} placeholder="MI Remodelers" />
            </label>
            <label>
              <span>Client / business profile</span>
              <input value={draft.businessProfileLabel} onChange={(event) => onDraftChange({ ...draft, businessProfileLabel: event.target.value })} placeholder="Trust Compression" />
            </label>
            <label className="wide-field">
              <span>Avatar URL</span>
              <input value={draft.avatarUrl} onChange={(event) => onDraftChange({ ...draft, avatarUrl: event.target.value })} placeholder="https://..." />
            </label>
            <button className="wide-action" disabled={working}>
              {working ? <Loader2 className="spin" /> : <RefreshCw />}
              Save and analyze
            </button>
          </form>
        </section>

        <section className="focus-panel social-profiles-panel">
          <div className="mini-head">
            <span>Saved profiles</span>
            <strong>{profiles.length ? "Ready to reuse" : "None yet"}</strong>
          </div>
          {profiles.length ? (
            <div className="social-profile-card-list">
              {profiles.map((profile) => (
                <article
                  className={profile.id === selectedProfileId ? "social-profile-card is-active" : "social-profile-card"}
                  key={profile.id}
                >
                  <div className="social-profile-card-top">
                    <div className="social-profile-badge">{iconForPlatform(profile.platform)}</div>
                    <div>
                      <span>{platformLabel(profile.platform)}</span>
                      <strong>{profile.displayName || profile.username || "Untitled profile"}</strong>
                      <p>{profile.username ? `@${profile.username.replace(/^@+/, "")}` : profile.profileUrl || "No handle saved yet"}</p>
                    </div>
                  </div>
                  <div className="social-profile-card-meta">
                    <small>{profile.businessProfileLabel || "No business profile label"}</small>
                    <small>{profile.lastAnalyzedAt ? `Last analyzed ${formatDateTime(profile.lastAnalyzedAt)}` : "Not analyzed yet"}</small>
                  </div>
                  <div className="tracking-link-button-row social-profile-actions">
                    <button className="text-button compact" type="button" onClick={() => onAnalyze(profile)}>
                      <RefreshCw />
                      Analyze
                    </button>
                    <button className="text-button compact" type="button" onClick={() => onViewReport(profile)}>
                      <ExternalLink />
                      View report
                    </button>
                    <button className="text-button compact danger" type="button" onClick={() => onRemove(profile)}>
                      <Trash2 />
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="tracking-empty-state social-profile-empty-state">
              <span>Saved profiles</span>
              <h3>No social profiles saved yet.</h3>
              <p>No social profiles saved yet. Add a profile URL to start tracking performance.</p>
            </div>
          )}
        </section>
      </section>

      <section className="recommendation-board social-profiles-report-board">
        <div className="mini-head">
          <span>Profile report</span>
          <strong>{selected ? "Cached snapshot" : "Select a profile"}</strong>
        </div>
        {selected ? (
          <div className="social-profile-report">
            <div className="social-profile-report-top">
              <div className="social-profile-report-mark">{iconForPlatform(selected.platform)}</div>
              <div>
                <h2>{selected.displayName || selected.username || "Saved profile"}</h2>
                <p>{selected.profileUrl || "No profile URL stored"}</p>
              </div>
            </div>
            <div className="tracking-overview tracking-overview-compact social-profile-overview">
              <MetricStat label="Platform" value={platformLabel(selected.platform)} detail="Saved workspace platform label." />
              <MetricStat label="Username" value={selected.username ? `@${selected.username.replace(/^@+/, "")}` : "Missing"} detail="Normalized handle stored for reuse." />
              <MetricStat label="Business profile" value={selected.businessProfileLabel || "Unassigned"} detail="Connected client or business profile label." />
              <MetricStat label="Added" value={formatDateTime(selected.createdAt) ?? "Unknown"} detail="Date the profile was first saved." />
              <MetricStat label="Last analyzed" value={formatDateTime(selected.lastAnalyzedAt) ?? "Not yet"} detail="Most recent reuse/analysis timestamp." />
              <MetricStat label="Cached status" value={snapshot?.status ?? "saved"} detail="Current cached analysis state." />
            </div>
            <div className="tracking-signal-grid social-profile-signal-grid">
              <div>
                <span>Profile URL</span>
                <strong>{selected.profileUrl || "No profile URL stored"}</strong>
              </div>
              <div>
                <span>Display name</span>
                <strong>{snapshot?.displayName || selected.displayName || "Not provided"}</strong>
              </div>
              <div>
                <span>Cached refresh</span>
                <strong>{formatDateTime(snapshot?.refreshedAt ?? null) ?? "Waiting for first analysis"}</strong>
              </div>
            </div>
            {selected.avatarUrl ? (
              <a className="text-link" href={selected.avatarUrl} target="_blank" rel="noreferrer">
                View avatar asset
              </a>
            ) : (
              <p className="metric-empty">No avatar URL saved for this profile yet.</p>
            )}
          </div>
        ) : (
          <div className="tracking-empty-state social-profile-empty-state">
            <span>Profile report</span>
            <h3>Select a saved profile.</h3>
            <p>Use View Report on any saved profile to inspect the cached profile details and rerun analysis when needed.</p>
          </div>
        )}
      </section>
    </section>
  );
}

function MetricStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="social-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function iconForPlatform(platform: string) {
  if (platform === "instagram") return <Instagram />;
  if (platform === "facebook") return <Facebook />;
  if (platform === "youtube") return <Youtube />;
  if (platform === "linkedin") return <Linkedin />;
  return <UserRound />;
}

function platformLabel(platform: string) {
  return platform.charAt(0).toUpperCase() + platform.slice(1).replace(/_/g, " ");
}
