# Temporary review access

Super administrators enable, replace, or revoke the login under Settings > Workspace & team > Temporary AI review access. The installation is pinned to Unmarked Space by the singleton review_access record. Ordinary workspace administrators cannot activate it.

Each activation creates a new Supabase Auth user and a random password shown once in the admin UI. No plaintext password is stored by the app. The prior account immediately loses access when the grant is replaced. Its password is also randomized and the account banned. Expiry is four hours from activation, not from the last login. Password rotation alone is not the expiry mechanism.

The tt_reviewer Postgres role does not inherit authenticated. It has SELECT grants on an explicit set of workspace content and activity tables, and no write grants or connector-secret access. Restrictive SELECT policies check the current grant, workspace, revocation and database time even when a JWT remains valid. The two existing workspace-creation/invitation RPCs are not executable by this role. No scheduler is required for the data-access cutoff.

API middleware validates review tokens with Supabase Auth and reads the current grant without caching. It permits only an explicit GET allowlist; new endpoints, all mutation methods, connector settings, platform administration and MCP are denied by default. Do not add endpoints without inspecting their server-side reads and side effects. Public unauthenticated share links retain their existing public behavior.

The real app UI is used, with a review banner and expiry checks. Automatic imports and product activity writes are skipped. Local draft interactions are not persisted to the database; attempts to publish or change server state are denied. Viewing published content is excluded from customer metrics by the existing workspace-browser marker.

Run scripts/review-access-test.cjs and test database role behavior before changing the access model. Test both active and expired grants, direct database writes, privileged RPCs, credential-table reads, cross-workspace reads, and API mutations. Do not grant tt_reviewer membership in authenticated, service_role, or another role.

Accounts can still authenticate after expiry if the underlying Auth token remains valid, but no protected workspace data is available. Cached data already displayed cannot be recalled; the UI signs out on expiry or revocation. Re-enabling uses a different user ID so old JWTs cannot regain access.
