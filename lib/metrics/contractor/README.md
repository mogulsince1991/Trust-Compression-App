# Contractor metrics engine

Phase 1 imports the existing local contractor metrics engine into Trust Compression without rewriting the calculations.

## What lives here

- `metricRules.js` - deterministic reporting rules, paid/organic patterns, close outcome rules.
- `domain.js` - normalization and numeric/date helpers.
- `normalize.js` - spend, GHL/Windsor contact, and JobTread job normalizers.
- `match.js` - lead-to-job matching by email, phone, then name.
- `attribution.js` - paid/organic/source bucketing and vendor matching.
- `outcomes.js` - close outcome grouping from notes/status text.
- `timeToClose.js` - close-time calculations.
- `metrics.js` - KPI calculation engine.
- `report.js` - report orchestration from normalized rows.
- `csv.js` / `spendArchive.js` / `jobOverrides.js` - existing support helpers.

## Boundary rule

This module should stay provider-agnostic. It should receive canonical rows and return report data. It should not directly know how to authenticate with GoHighLevel, JobTread, Google, or any future CRM.

Connector code belongs in server-only integration modules that normalize external records before calling this engine.

## Security rule

Do not import this module from client components. Some support files intentionally use Node APIs such as `fs`, and future connector layers will handle secrets server-side only.

The smoke route at `/api/metrics/contractor/smoke` uses sample rows only. It must not be changed to read live customer data or local cache files.

## Phase 2 direction

1. Add Supabase tables for connector accounts, sync jobs, normalized contractor leads/jobs/spend rows, and generated reports.
2. Store connector credentials only server-side and encrypted where possible.
3. Add provider adapters for GHL, JobTread, Windsor/imported CSV, and manual spend upload.
4. Compare output against the old local report before building UI.
