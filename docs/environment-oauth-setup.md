# Production and test setup

Production: https://trusttale.co
Existing production database: boswlaonbdxugkocquzv (preserve customer data).
Test: https://trustcompression.unmarked.media
New test database: xknbpwhkoakdiqkvzdbz (created, not yet initialized or connected).

Do not move the test domain until its deployment uses only test database keys,
schema migrations have passed, and test sign-in works. Both domains currently
still serve production. A separate project existing does not isolate the app.

## Production Google configuration

Google Cloud Web OAuth client authorized JavaScript origins:
- https://trusttale.co
- https://app.trusttale.co (retain while existing links use this host)

Authorized redirect URIs for the appropriate clients:
- https://boswlaonbdxugkocquzv.supabase.co/auth/v1/callback (Google account login)
- https://trusttale.co/api/connect/google-drive/callback (existing Drive import connector)
- https://trusttale.co/api/workspace-storage/callback (shared photo storage)
- https://app.trusttale.co/api/connect/google-drive/callback (compatibility)
- https://app.trusttale.co/api/workspace-storage/callback (compatibility)

Supabase production Auth URL configuration:
- Site URL: https://trusttale.co
- Allow https://trusttale.co/auth/callback
- Retain https://app.trusttale.co/auth/callback for existing users.
- Retain legacy test-domain callback until the test-domain cutover is verified.

Photos Picker uses JavaScript origins; it is not the Supabase sign-in flow.
Enable Drive API and Photos Picker API in the Google project as applicable.
Configure the consent screen, test users/publication, and application branding.

## Test configuration after deployment isolation

Use a separate Google OAuth client where possible. Add the test origin and:
- https://xknbpwhkoakdiqkvzdbz.supabase.co/auth/v1/callback
- https://trustcompression.unmarked.media/api/connect/google-drive/callback
- https://trustcompression.unmarked.media/api/workspace-storage/callback

Test Supabase Site URL: https://trustcompression.unmarked.media
Test Supabase allowed redirect: https://trustcompression.unmarked.media/auth/callback
Test uploads must use a separate Drive folder. Do not copy production OAuth tokens,
CRM credentials, user sessions, or message-sending credentials into test.

## Release and data direction

Apply versioned schema migrations to test first, then promote the same reviewed
migrations and compatible code to production. Never restore test over production.
Take a recovery backup before risky production migrations.
An on-demand refresh should allowlist and sanitize selected sample data only;
exclude identities, contact details, integration secrets, and outbound jobs.
That refresh mechanism is not implemented yet. No customer data has been copied.
