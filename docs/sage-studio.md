# Sage Studio interface

The desktop and mobile interface use the selected warm-minimal direction: cloud surfaces, charcoal text, restrained sage highlights, and amber for attention. Appearance supports Light, Dark, and System and is remembered in the browser. Public customer journey styles are intentionally not changed by this app-shell redesign.

## Navigation and behavior

- `/app/home`: next action, setup progress, and recent journeys.
- `/app/library`: one searchable video/document library; list or grid; preview; add hosted content; choose assets for a journey.
- `/app/journeys`: saved journeys and drafts. Opening this page never starts a new draft.
- `/app/journeys/editor`: Content, Details, Preview, and Share. Draft recovery is scoped by signed-in user and workspace in session storage.
- `/app/journeys/archive`: existing archive/restore tools using the selected workspace.
- `/app/activity`: engagement and recipient CRM context, distinct from revenue reporting.
- `/app/activity/links`: existing tracking link tools.
- `/app/reports`: existing configurable reporting engine using the selected workspace. The default date window is the current calendar month. Connections no longer automatically switches back to Metrics.
- `/app/settings`: workspace, team, and assistant integrations.
- `/app/settings/content`: source imports and removal.
- `/app/settings/youtube`: existing YouTube reports, with report IDs in the URL.

Legacy entry routes redirect into the new shell. Existing public `/share`, `/embed`, `/t`, and MCP routes are unchanged.

On mobile, navigation occupies its own layout row outside the scrolling content area. Preview uses the full content width. Selection and editor actions remain in document flow rather than covering assets.

## Draft publishing

New journey POST requests accept `publish: false` to create a private draft with no publication timestamp. Omitting the field preserves the pre-existing publish behavior for other callers. Explicit publication uses `publish: true`. Existing published journeys use **Publish changes**, not **Save draft**; this release does not introduce a separate revision model for already-live content.

General and personalized share URLs are separate. Creating a personalized URL does not send an SMS or email. Source permissions still govern whether a recipient can view an embedded asset.

No schema migration or reporting formula changes are included.

## Verification

Run the usual TypeScript check and production build. Additional checks:

```sh
node scripts/sage-draft-contract.cjs
node scripts/sage-ui-smoke.cjs
```

The UI script requires Playwright and an installed browser, plus a local app on port 3120. `PLAYWRIGHT_MODULE` may point to a bundled Playwright package, `TEST_BROWSER_CHANNEL=chrome` selects installed Chrome, and `TEST_BASE_URL` changes the local URL. Non-local targets are rejected. Application/CRM requests are intercepted with fixtures, and the draft contract test mocks the database. Neither test writes production records.

Screenshots and test output are written to ignored `artifacts/sage-studio/`.

Still requires deployment verification with a real authorized account: provider imports, actual persisted Supabase drafts, authentication redirects, and third-party embedded playback on physical devices. Fixture UI tests do not establish those external services are healthy.
