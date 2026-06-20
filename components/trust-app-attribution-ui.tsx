"use client";

import { Copy, Loader2, MousePointerClick } from "lucide-react";
import type { FormEvent } from "react";
import {
  TRACKING_CONVERSION_TYPES,
  TRACKING_INSTALL_EXAMPLES,
  buildTrackingLinkSummaries,
  formatCurrencyValue,
  formatDateTime,
  formatPlatformLabel,
  getOriginFromUrl,
  getTrackingScriptTag,
  rate,
  type ContactRow,
  type DbVideo,
  type JourneySummary,
  type MetricsState,
  type SourceRow,
  type TrackingDraft,
  type TrackingState
} from "@/components/trust-app-shared";

export function MetricsView({
  metrics,
  videos,
  sources,
  journeys,
  contacts,
  tracking
}: {
  metrics: MetricsState;
  videos: DbVideo[];
  sources: SourceRow[];
  journeys: JourneySummary[];
  contacts: ContactRow[];
  tracking: TrackingState;
}) {
  const opens = metrics.views.filter((event) => event.event_type === "opened");
  const starts = metrics.views.filter((event) => event.event_type === "video_started");
  const ctas = metrics.views.filter((event) => event.event_type === "cta_clicked");
  const redirects = tracking.events.filter((event) => event.eventType === "redirect");
  const linkPageViews = tracking.events.filter((event) => event.eventType === "page_view");
  const linkCtas = tracking.events.filter((event) => event.eventType === "cta_click");
  const linkConversions = tracking.events.filter((event) => TRACKING_CONVERSION_TYPES.includes(event.eventType as (typeof TRACKING_CONVERSION_TYPES)[number]));
  const linkSummaries = buildTrackingLinkSummaries(tracking.links, tracking.events, tracking.identities);
  const attributedRevenue = linkSummaries.reduce((sum, summary) => sum + summary.revenue, 0);
  const viewers = new Set(metrics.views.map((event) => event.viewer_label || event.metadata?.viewerId).filter(Boolean));
  const stitchedVisitors = tracking.identities.filter((identity) => identity.contactId || identity.email || identity.externalId);
  const trackedContacts = new Set([...tracking.events.map((event) => event.contactId), ...tracking.identities.map((identity) => identity.contactId)].filter(Boolean)).size;
  const journeyRows = journeys.map((journey) => ({
    journey,
    opens: opens.filter((event) => event.journey_id === journey.id).length,
    starts: starts.filter((event) => event.journey_id === journey.id).length,
    ctas: ctas.filter((event) => event.journey_id === journey.id).length
  }));
  const videoRows = videos
    .map((video) => ({
      video,
      starts: starts.filter((event) => event.video_id === video.id).length,
      ctas: ctas.filter((event) => event.video_id === video.id).length
    }))
    .sort((a, b) => b.starts - a.starts)
    .slice(0, 10);
  const contactEvents = metrics.views.filter((event) => event.metadata?.contactId);

  return (
    <section className="metrics-board">
      <div className="metrics-intro">
        <div>
          <span>Metrics</span>
          <h2>What content moves buyers?</h2>
        </div>
        <p>A tighter scoreboard up top, then ranked proof assets beneath it. This view should help you see what earns attention, what gets clicked, and which links start producing downstream conversion signals.</p>
      </div>

      <div className="metrics-scoreboard">
        <MetricCard label="Journey opens" value={String(opens.length)} detail="Public or contact-specific journey page opens." />
        <MetricCard label="Video starts" value={String(starts.length)} detail="Videos started inside journeys." />
        <MetricCard label="Tracked redirects" value={String(redirects.length)} detail="First-click hits through /t/{slug}." />
        <MetricCard label="Tracked conversions" value={String(linkConversions.length)} detail={`${rate(linkConversions.length, Math.max(linkPageViews.length, 1))} of destination page views converted.`} />
        <MetricCard label="Attributed revenue" value={formatCurrencyValue(attributedRevenue)} detail="Purchase value captured against tracked links." />
        <MetricCard label="CTA rate" value={rate(ctas.length + linkCtas.length, opens.length + linkPageViews.length)} detail="Click-through across journeys and tracked destinations." />
      </div>

      <div className="metrics-rank-grid">
        <MetricPanel
          title="Top journeys"
          countLabel={`${journeyRows.length} journeys`}
          emptyLabel="No journey activity yet."
          rows={journeyRows
            .filter((row) => row.opens || row.starts || row.ctas)
            .sort((a, b) => b.opens - a.opens || b.starts - a.starts || b.ctas - a.ctas)
            .slice(0, 6)
            .map((row) => ({ title: row.journey.title, meta: `${row.opens} opens`, detail: `${row.starts} starts / ${row.ctas} CTA clicks` }))}
        />
        <MetricPanel
          title="Top videos"
          countLabel={`${videoRows.length} ranked`}
          emptyLabel="No video starts yet."
          rows={videoRows.filter((row) => row.starts || row.ctas).slice(0, 6).map((row) => ({ title: row.video.title, meta: `${row.starts} starts`, detail: `${row.ctas} CTA clicks / ${row.video.sales_category ?? formatPlatformLabel(row.video.source_platform)}` }))}
        />
        <MetricPanel
          title="Top tracked links"
          countLabel={`${linkSummaries.length} live links`}
          emptyLabel="No tracked-link activity yet."
          rows={linkSummaries.filter((summary) => summary.redirects || summary.pageViews || summary.conversionCount).slice(0, 6).map((summary) => ({ title: summary.link.title, meta: `${summary.redirects} redirects / ${summary.pageViews} views`, detail: `${summary.conversionCount} conversions / ${formatCurrencyValue(summary.revenue, summary.currency)}` }))}
        />
      </div>

      <div className="metrics-secondary-grid">
        <section className="metrics-secondary-panel">
          <div className="mini-head">
            <span>Contacts</span>
            <strong>{contacts.length}</strong>
          </div>
          <div className="metric-grid metrics-secondary-cards">
            <MetricCard label="Known viewers" value={String(viewers.size)} detail="Anonymous viewer IDs plus future contacts." />
            <MetricCard label="Stitched visitors" value={String(stitchedVisitors.length)} detail="Visitors matched to a contact, email, or CRM identity." />
            <MetricCard label="Tracked contacts" value={String(trackedContacts)} detail="Known contacts now tied to tracked-link activity." />
            <MetricCard label="Contact events" value={String(contactEvents.length)} detail="Events attached to contact-specific journey links." />
          </div>
        </section>

        <section className="metrics-secondary-panel">
          <div className="mini-head">
            <span>Source footprint</span>
            <strong>{sources.length}</strong>
          </div>
          <div className="metric-grid metrics-secondary-cards">
            <MetricCard label="Sources" value={String(sources.length)} detail="Connected public/imported sources." />
            <MetricCard label="Videos" value={String(videos.length)} detail="Imported workspace videos." />
            <MetricCard label="Drive sources" value={String(sources.filter((source) => source.platform === "google_drive").length)} detail="Public Drive folders." />
            <MetricCard label="YouTube sources" value={String(sources.filter((source) => source.platform === "youtube").length)} detail="Videos, playlists, channels, RSS/API imports." />
          </div>
        </section>
      </div>
    </section>
  );
}

export function LinkTrackingView({
  draft,
  journeys,
  tracking,
  working,
  onDraftChange,
  onCreate
}: {
  draft: TrackingDraft;
  journeys: JourneySummary[];
  tracking: TrackingState;
  working: boolean;
  onDraftChange: (draft: TrackingDraft) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const summaries = buildTrackingLinkSummaries(tracking.links, tracking.events, tracking.identities);
  const totalUniqueVisits = new Set(tracking.events.map((event) => event.visitId).filter(Boolean)).size;
  const totalUniqueVisitors = new Set(tracking.events.map((event) => event.visitorId || event.sessionId).filter(Boolean)).size;
  const identifiedVisitors = tracking.identities.filter((identity) => identity.contactId || identity.email || identity.externalId);
  const knownContacts = new Set([...tracking.events.map((event) => event.contactId), ...tracking.identities.map((identity) => identity.contactId)].filter(Boolean)).size;
  const totalRevenue = summaries.reduce((sum, summary) => sum + summary.revenue, 0);
  const installOrigin = summaries[0]?.link.trackingUrl ? getOriginFromUrl(summaries[0].link.trackingUrl) : "";
  const journeyLookup = Object.fromEntries(journeys.map((journey) => [journey.id, journey]));
  const totalCtaRate = rate(
    tracking.events.filter((event) => event.eventType === "cta_click").length,
    Math.max(tracking.events.filter((event) => event.eventType === "page_view").length, 1)
  );

  return (
    <section className="tracking-studio">
      <section className="tracking-side-stack">
        <section className="workflow-panel tracking-panel tracking-create-panel">
          <div className="mini-head">
            <span>Operations studio</span>
            <strong>{tracking.links.length} live links</strong>
          </div>
          <div className="tracking-panel-copy">
            <h2>Create tracked redirects without leaving the workflow.</h2>
            <p>Every link becomes a measurable handoff. Tie it to a journey when needed, then keep first-click attribution and destination-site events attached to the original trust path.</p>
          </div>
          <form className="brief-grid tracking-form" onSubmit={onCreate}>
            <label>
              <span>Link title</span>
              <input value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} placeholder="Estimate request CTA" required />
            </label>
            <label>
              <span>Destination URL</span>
              <input value={draft.destinationUrl} onChange={(event) => onDraftChange({ ...draft, destinationUrl: event.target.value })} placeholder="https://your-site.com/landing-page" required />
            </label>
            <label className="wide-field">
              <span>Journey</span>
              <select value={draft.journeyId} onChange={(event) => onDraftChange({ ...draft, journeyId: event.target.value })}>
                <option value="">None</option>
                {journeys.map((journey) => (
                  <option key={journey.id} value={journey.id}>
                    {journey.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="wide-action" disabled={working}>
              {working ? <Loader2 className="spin" /> : <MousePointerClick />}
              Create tracking link
            </button>
          </form>
        </section>

        <section className="focus-panel tracking-panel tracking-install-panel">
          <div className="mini-head">
            <span>Install tc.js</span>
            <strong>Use the script on the destination site</strong>
          </div>
          <div className="workflow-steps tracking-install-steps">
            <article className="workflow-step">
              <i>1</i>
              <div>
                <strong>Route every CTA through a tracking link</strong>
                <small>Use the generated <code>/t/{`{slug}`}</code> link anywhere the trust path starts.</small>
              </div>
            </article>
            <article className="workflow-step">
              <i>2</i>
              <div>
                <strong>Install the script on the destination page or site</strong>
                <code>{installOrigin ? `<script async src="${installOrigin}/tc.js"></script>` : `<script async src="https://your-app-domain.com/tc.js"></script>`}</code>
              </div>
            </article>
            <article className="workflow-step">
              <i>3</i>
              <div>
                <strong>Capture the moments that matter</strong>
                {TRACKING_INSTALL_EXAMPLES.map((example) => (
                  <code key={example}>{example}</code>
                ))}
              </div>
            </article>
          </div>
          <p className="tracking-install-note">Automatic capture includes page views, <code>data-tc-cta</code> clicks, and <code>data-tc-form</code> submissions. Add <code>window.TrustCompression.identify</code> when you want known lead or customer data stitched back onto the original visit.</p>
        </section>
      </section>

      <section className="recommendation-board tracking-links-board tracking-operations-board">
        <div className="mini-head">
          <span>Tracked links</span>
          <strong>{tracking.events.length} events captured</strong>
        </div>
        <div className="tracking-board-intro">
          <h2>Scan active redirects and see which ones are actually moving buyers.</h2>
          <p>Keep the operational actions close to the performance signal: copy the redirect, install the script, and check which links are earning visits, landing views, CTA clicks, downstream conversions, and known-contact matches.</p>
        </div>
        <div className="tracking-overview tracking-overview-compact">
          <MetricCard label="Tracked links" value={String(tracking.links.length)} detail="Active redirects in this workspace." />
          <MetricCard label="Unique visits" value={String(totalUniqueVisits)} detail="Distinct first-click visits across all tracked links." />
          <MetricCard label="Identified visitors" value={String(identifiedVisitors.length)} detail="Visitors stitched to a contact, email, or CRM identity." />
          <MetricCard label="Known contacts" value={String(knownContacts)} detail="Distinct people now tied to tracked-link activity." />
          <MetricCard label="Attributed revenue" value={formatCurrencyValue(totalRevenue)} detail="Purchase value captured through tc.js." />
          <MetricCard label="CTA rate" value={totalCtaRate} detail="Destination CTA clicks divided by destination page views." />
        </div>
        {summaries.length ? (
          <div className="tracking-link-list">
            {summaries.map((summary) => {
              const journey = summary.link.journeyId ? journeyLookup[summary.link.journeyId] : null;
              const scriptTag = getTrackingScriptTag(summary.link);
              return (
                <article className="tracking-link-card" key={summary.link.id}>
                  <div className="tracking-link-header">
                    <div>
                      <span>{summary.link.slug}</span>
                      <h3>{summary.link.title}</h3>
                      <p>{summary.link.destinationUrl}</p>
                    </div>
                    <div className="tracking-link-stats">
                      <strong>{summary.redirects}</strong>
                      <small>redirects</small>
                      <strong>{summary.pageViews}</strong>
                      <small>landing views</small>
                      <strong>{formatCurrencyValue(summary.revenue, summary.currency)}</strong>
                      <small>revenue</small>
                    </div>
                  </div>
                  <div className="tracking-link-badge-row">
                    <span className="tracking-badge">{journey ? "Journey linked" : "Standalone link"}</span>
                    <strong>{journey?.title ?? "No journey attached"}</strong>
                    <small>{formatDateTime(summary.lastTouch) ? `Last activity ${formatDateTime(summary.lastTouch)}` : "No activity yet"}</small>
                  </div>
                  <div className="tracking-link-detail-grid">
                    <div><strong>{summary.uniqueVisits}</strong><small>unique visits</small></div>
                    <div><strong>{summary.uniqueVisitors}</strong><small>unique visitors</small></div>
                    <div><strong>{summary.identifiedVisitors}</strong><small>identified visitors</small></div>
                    <div><strong>{summary.knownContacts}</strong><small>known contacts</small></div>
                    <div><strong>{rate(summary.pageViews, Math.max(summary.redirects, 1))}</strong><small>landing rate</small></div>
                    <div><strong>{rate(summary.ctas, Math.max(summary.pageViews, 1))}</strong><small>cta rate</small></div>
                    <div><strong>{summary.formSubmits}</strong><small>form submits</small></div>
                    <div><strong>{summary.optIns}</strong><small>opt-ins</small></div>
                    <div><strong>{summary.bookings}</strong><small>bookings</small></div>
                    <div><strong>{summary.purchases}</strong><small>purchases</small></div>
                  </div>
                  <div className="tracking-signal-grid">
                    <div><span>Top destination pages</span><strong>{summary.topPages.length ? summary.topPages.join(" / ") : "Waiting for page views"}</strong></div>
                    <div><span>Known contacts</span><strong>{summary.topContacts.length ? summary.topContacts.join(" / ") : "No identified contacts yet"}</strong></div>
                    <div><span>Strongest events</span><strong>{summary.topEvents.length ? summary.topEvents.join(" / ") : "No downstream signals yet"}</strong></div>
                  </div>
                  <div className="tracking-link-actions">
                    <a className="text-link" href={summary.link.trackingUrl} target="_blank" rel="noreferrer">
                      {summary.link.trackingUrl}
                    </a>
                    <code>{scriptTag}</code>
                    <div className="tracking-link-button-row">
                      <button className="text-button compact" type="button" onClick={() => navigator.clipboard?.writeText(summary.link.trackingUrl)}>
                        <Copy />
                        Copy link
                      </button>
                      <button className="text-button compact" type="button" onClick={() => navigator.clipboard?.writeText(scriptTag)}>
                        <Copy />
                        Copy script
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="tracking-empty-state">
            <span>Tracked links</span>
            <h3>No tracked links yet.</h3>
            <p>Start with one CTA destination, route it through <code>/t/{`{slug}`}</code>, then install <code>/tc.js</code> on the destination page so the full path can be measured.</p>
          </div>
        )}
      </section>
    </section>
  );
}

function MetricPanel({
  title,
  countLabel,
  rows,
  emptyLabel
}: {
  title: string;
  countLabel: string;
  rows: Array<{ title: string; meta: string; detail: string }>;
  emptyLabel: string;
}) {
  return (
    <section className="metric-panel">
      <div className="mini-head">
        <span>{title}</span>
        <strong>{countLabel}</strong>
      </div>
      {rows.length ? (
        <div className="metric-list metric-rank-list">
          {rows.map((row, index) => (
            <article className="metric-rank-row" key={`${row.title}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{row.title}</strong>
                <small>{row.meta}</small>
              </div>
              <p>{row.detail}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="metric-empty">{emptyLabel}</p>
      )}
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
