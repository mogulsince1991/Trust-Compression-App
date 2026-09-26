# Document-authoritative contractor reporting

## Business authority

Rule version: `document-sales-v1`. Qualifying positive BA, CO and FS documents require proven historical approval. Recognition is inclusive of the exact selected dates in America/New_York. Job Sold Date remains informational/time-to-close metadata, not sales eligibility or revenue authority.

Confirmed user decision: match the local app. A later-denied document on an open, non-canceled job is excluded; qualifying canceled/closed rows remain in gross and are excluded from net. Superseded denied versions are excluded. Mixed document codes combine per local grouping; report rows, physical documents and distinct sold jobs are separate counts.

Removed active job-date/job-level revenue priorities and customer-specific date overrides. Stored metric definitions are migrated onto document-backed datasets. Old saved reports without the new sales-rule version are not displayed as current reports.

## Canonical schema

Each sales row carries jobId, jobNumber, customerName, documentId/documentIds, documentCode, documentNumber, documentDate, approvalDate/approvalTimestamp, documentStatus, documentCount, amount, amountParts, amountBreakdown, cancelled, jobStatus, consultant, setter, source and component documents. Normalized jobs aggregate only non-canceled canonical rows.

Revenue, paid/organic revenue, source/vendor/consultant breakdowns, sold-job counts, average tickets, close rates, ROAS and NSLI consume that shared net rowset. Attribution runs after eligibility; it cannot invent sales or change their amounts. Matching prefers phone, email, then normalized customer/primary-contact names.

## Queries and cache

Read-only JobTread queries enumerate organization documents and all approval-event pages, independent of job creation/sold dates. Candidate job details are loaded for recognized sales or appointment discovery. Document, event, job and overflowing custom-field connections are paginated. Missing connections or pagination loops fail the report instead of returning partial sales.

The service-only `contractor_connector_cache` table scopes data by workspace, connected account, rule version and cache key. Exact-period snapshots also include start/end/timezone and expire after five minutes. Individual audited documents use a fingerprint and 24-hour freshness window; completed audits survive an interrupted scan. No client role can read this cache.

GHL contact pagination supplies attribution candidates outside the lead reporting period. Lead metrics still apply their own reporting period. Any failed connected-source scan stops report generation.

## UI and export

Total Sales exposes gross/net amounts and counts, component amounts and approval dates. The spreadsheet-compatible XML export includes raw and calculated report datasets. Legacy sold-date configuration controls are replaced with the current authority explanation.

Collection refresh now deduplicates canonical folder/channel/playlist identities, checks once per workspace/user per page lifetime, and applies a 15-minute server freshness guard. Automatic checks skip existing video IDs. A small temporary bottom status replaces the top banner; manual imports still support updating existing content.

## Verification

Local source snapshots, not production overrides:

| Period | Gross rows | Gross amount | Net rows | Net amount |
| --- | ---: | ---: | ---: | ---: |
| May 2026 | 10 | 328,292.95 | 9 | 166,949.20 |
| June 2026 | 18 | 411,825.24 | 16 | 374,122.12 |
| July 2026 | 16 | 333,820.05 | 13 | 272,061.06 |
| May 1-8, 2026 | 3 | 72,877.20 | 3 | 72,877.20 |

`scripts/document-sales-test.cjs` tests date authority, boundaries, grouping, cancellation, supersession and downstream reconciliation; set LOCAL_SALES_CACHE to the local connector-cache directory to run the snapshots. `scripts/document-history-test.cjs` tests pagination failures, historical approval and cache scope. Source-refresh regressions cover deduplication, pagination and repeated navigation.

## Limitations

Approval history must be readable and contain a documented approval transition. Missing proof is not replaced with issue dates, sold dates or job-level totals. Consultant/setter values remain blank when unavailable. Initial full history discovery can be slow; large accounts may require another request after the execution limit, reusing completed audits. No background worker was added. A live authenticated report must still confirm provider query compatibility and current account totals; reference-snapshot tests are not a live API verification.

## Changed areas

Security advisor review: the new cache intentionally has no client RLS policies because all client grants are revoked and only the service role accesses it. Other advisory warnings require a separate review: [authenticated security-definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No unrelated auth permissions were changed.

- `lib/integrations/contractor/{jobtread.ts,document-history.ts,gohighlevel.ts}`: discovery, history, pagination and cache.
- `lib/metrics/contractor/{salesDocuments.js,normalize.js,domain.js,metrics.js,report.js,dbReport.js,config.ts,configuredMetrics.ts,metricRules.js,attribution.js,match.js}`: canonical rules, reporting, configuration and attribution.
- `app/api/metrics/contractor/{report,smoke}/route.js`: report orchestration, persistence, export and smoke fixture.
- `components/contractor-{total-sales,metrics-workspace,metrics-console}.tsx`: sales audit UI, export and version guard.
- `lib/{source-refresh.ts,import-runner.ts}`, source reimport/private-folder routes and `components/library-source-refresh.tsx`: quiet collection checks.
- `data/job-overrides.json`: removed one-off dates.
- `supabase/migrations/20260926153813_document_sales_connector_cache.sql`: server-only durable history cache.
- Test scripts listed above and `scripts/source-refresh-test.cjs`.
