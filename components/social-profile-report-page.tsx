"use client";

import { ArrowLeft, ArrowUpRight, Import, Loader2, RefreshCw, Youtube } from "lucide-react";
import { formatDateTime, type SocialProfileRow } from "@/components/trust-app-shared";
import { parseMetricSnapshot, readSocialProfileReport, socialProfileStatusLabel } from "@/lib/social-profiles";

export function SocialProfileReportPage({
  profile,
  working,
  onBack,
  onRefresh,
  onImportChannel,
  onImportVideo,
}: {
  profile: SocialProfileRow | null;
  working: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onImportChannel: () => void;
  onImportVideo: (videoId: string) => void;
}) {
  if (!profile) {
    return (
      <section className="social-report-page-shell">
        <div className="social-report-page-topline">
          <button className="text-button compact" type="button" onClick={onBack}>
            <ArrowLeft />
            Back to saved profiles
          </button>
        </div>
        <div className="tracking-empty-state social-profile-empty-state">
          <span>Profile report</span>
          <h3>That saved profile is no longer available.</h3>
          <p>Go back to Social Profiles and choose another saved profile.</p>
        </div>
      </section>
    );
  }

  const snapshot = parseMetricSnapshot(profile.latestCachedMetrics);
  const report = readSocialProfileReport(profile.latestCachedMetrics);
  const channelUrl = typeof report.channelSnapshot?.canonicalUrl === "string" ? report.channelSnapshot.canonicalUrl : profile.profileUrl;

  return (
    <section className="social-report-page-shell">
      <div className="social-report-page-topline">
        <button className="text-button compact" type="button" onClick={onBack}>
          <ArrowLeft />
          Back to saved profiles
        </button>
        <div className="social-report-page-actions">
          <button className="text-button compact" type="button" onClick={onRefresh} disabled={working}>
            {working ? <Loader2 className="spin" /> : <RefreshCw />}
            Refresh report
          </button>
          <button className="wide-action compact" type="button" onClick={onImportChannel} disabled={working}>
            {working ? <Loader2 className="spin" /> : <Import />}
            Import channel uploads
          </button>
        </div>
      </div>

      <section className="social-report-hero">
        <div className="social-report-hero-copy">
          <div className="social-report-hero-head">
            <div className="social-profile-report-mark">
              <Youtube />
            </div>
            <div>
              <span className="eyebrow">YouTube social report</span>
              <h1>{report.title || profile.displayName || profile.username || "Saved profile"}</h1>
              <p>{report.summary}</p>
            </div>
          </div>
          <div className="social-report-hero-meta">
            <span>{socialProfileStatusLabel(snapshot.status)}</span>
            <span>{snapshot.sourceLabel || report.sourceLabel || "Saved profile"}</span>
            <span>{formatDateTime(snapshot.refreshedAt) ?? "Not analyzed yet"}</span>
          </div>
          {report.sourceNote ? <p className="social-report-source-note">{report.sourceNote}</p> : null}
        </div>

        <div className="social-report-hero-card">
          <span>Founder snapshot</span>
          <strong>{profile.businessProfileLabel || "Unassigned business profile"}</strong>
          <p>{channelUrl || "No profile URL stored"}</p>
          <div className="social-report-hero-links">
            {channelUrl ? (
              <a className="text-button compact" href={channelUrl} target="_blank" rel="noreferrer">
                <ArrowUpRight />
                Open on YouTube
              </a>
            ) : null}
            <div className="social-report-mini-grid">
              <div>
                <span>Last analyzed</span>
                <strong>{formatDateTime(profile.lastAnalyzedAt) ?? "Not yet"}</strong>
              </div>
              <div>
                <span>Saved handle</span>
                <strong>{profile.username ? `@${profile.username.replace(/^@+/, "")}` : "Missing"}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="tracking-overview social-report-overview-grid">
        {report.overview.map((metric) => (
          <article className="social-metric-card" key={metric.id}>
            <span>{metric.label}</span>
            <strong>{formatMetricValue(metric.value, metric.format)}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="social-report-section-shell">
        <div className="mini-head">
          <span>Top Content</span>
          <strong>{report.topVideos.length} ranked videos</strong>
        </div>
        {report.topVideos.length ? (
          <div className="social-video-grid">
            {report.topVideos.map((video) => (
              <article className="social-video-card" key={video.id}>
                <div className="social-video-card-top">
                  <div className="social-video-thumb">
                    {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt={video.title} /> : <Youtube />}
                  </div>
                  <div>
                    <span>{video.trustTheme}</span>
                    <strong>{video.title}</strong>
                    <p>{video.recommendationReason}</p>
                  </div>
                </div>
                <div className="social-video-stats">
                  <div>
                    <span>Views</span>
                    <strong>{formatMetricValue(video.viewCount, "number")}</strong>
                  </div>
                  <div>
                    <span>Published</span>
                    <strong>{formatDateTime(video.publishedAt)?.split(",")[0] ?? "Unknown"}</strong>
                  </div>
                  <div>
                    <span>Category</span>
                    <strong>{video.category}</strong>
                  </div>
                </div>
                <div className="social-video-actions">
                  {video.sourceUrl ? (
                    <a className="text-button compact" href={video.sourceUrl} target="_blank" rel="noreferrer">
                      <ArrowUpRight />
                      Open
                    </a>
                  ) : null}
                  <button className="text-button compact" type="button" onClick={() => onImportVideo(video.id)} disabled={working}>
                    {working ? <Loader2 className="spin" /> : <Import />}
                    {video.imported ? "Reimport" : "Import"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="metric-empty">No ranked video data is available for this profile yet.</p>
        )}
      </section>

      <section className="social-report-two-up">
        <section className="social-report-section-shell">
          <div className="mini-head">
            <span>Import Recommendations</span>
            <strong>{report.recommendations.length} suggested pulls</strong>
          </div>
          {report.recommendations.length ? (
            <div className="social-recommendation-list">
              {report.recommendations.map((item) => (
                <article className="social-recommendation-card" key={item.id}>
                  <div>
                    <span>{item.trustTheme}</span>
                    <strong>{item.title}</strong>
                    <p>{item.reason}</p>
                  </div>
                  <div className="social-recommendation-actions">
                    <small>{item.imported ? "Already in library" : "Ready to import"}</small>
                    <button className="text-button compact" type="button" onClick={() => onImportVideo(item.id)} disabled={working}>
                      {working ? <Loader2 className="spin" /> : <Import />}
                      {item.imported ? "Refresh import" : "Import to library"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="metric-empty">No recommendations are ready yet.</p>
          )}
        </section>

        <section className="social-report-section-shell">
          <div className="mini-head">
            <span>Content Gaps</span>
            <strong>{report.contentGaps.length} coverage signals</strong>
          </div>
          {report.contentGaps.length ? (
            <div className="social-gap-list">
              {report.contentGaps.map((gap) => (
                <article className={`social-gap-card is-${gap.status}`} key={gap.id}>
                  <div>
                    <span>{gap.status}</span>
                    <strong>{gap.title}</strong>
                  </div>
                  <p>{gap.detail}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="metric-empty">No content-gap analysis is available yet.</p>
          )}
        </section>
      </section>
    </section>
  );
}

function formatMetricValue(value: unknown, format: string) {
  if (value == null || value === "") return "Unavailable";
  const number = Number(value);

  if (format === "percent" && Number.isFinite(number)) {
    return `${number}%`;
  }

  if (format === "currency" && Number.isFinite(number)) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(number);
  }

  if (format === "number" && Number.isFinite(number)) {
    return new Intl.NumberFormat("en-US").format(number);
  }

  return String(value);
}
