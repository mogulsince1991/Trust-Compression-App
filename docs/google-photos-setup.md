# Google Photos to customer Google Drive

Library > Add content > Google Photos imports up to 100 selected photos per session.
Owners/admins connect workspace storage on Home or Settings. Existing content-writing
members can upload without another permission toggle; viewers cannot import. Google Picker lets people search
albums and select their contents, but this is not a live album/folder subscription.
Videos are skipped. Existing Drive/YouTube video playback is unchanged.
Selected photos go to an app-created TrustTale Photos folder in the connected Google
workspace account's Drive. New imports do not write to Supabase Storage, even temporarily.

## Google Cloud setup required

1. Enable Google Photos Picker API and Google Drive API in the OAuth client's project.
2. Use a Web application OAuth client. Configure `GOOGLE_PHOTOS_CLIENT_ID` in Vercel
   (the existing Google client ID is a fallback; no client secret is sent to the browser).
3. Add the exact authorized JavaScript origins used by customers:
   `https://app.trusttale.co`, `https://trusttale.co`, and
   `https://trustcompression.unmarked.media` where applicable. No paths or trailing slash.
4. Configure OAuth consent for
   `https://www.googleapis.com/auth/photospicker.mediaitems.readonly` and
   `https://www.googleapis.com/auth/drive.file`. Users must reconnect for Drive access.
   Add test users while testing; complete Google's publication/verification requirements
   before making access generally available. Review the Photos API developer policies
   against your intended use and update your public privacy policy.
5. Deploy after environment changes. Test sign-in, multi-selection, import, repeat
   import, image display in a published journey, and permanent deletion.

Workspace storage requires a server OAuth callback. Register
`https://app.trusttale.co/api/workspace-storage/callback` in the Google client's
authorized redirect URIs, plus the same path on any other app domains in use.
Configure `GOOGLE_STORAGE_CLIENT_ID` and `GOOGLE_STORAGE_CLIENT_SECRET` (existing
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are fallbacks). Enable Drive API.
Workspace access and refresh tokens are encrypted with AES-GCM in service-only
database tables, bound to the workspace. Prefer a dedicated `STORAGE_CREDENTIAL_KEY`;
otherwise the service-role key is used. Changing the encryption key requires reconnecting.
Only the Google Photos Picker token stays in browser component memory.
Settings can choose folders already accessible to the app under `drive.file`,
reconnect, or disconnect. Disconnect does not delete existing Drive files.
Imported image copies are bounded to 2048px and 10 MB each; this is not original-file backup.
The Google API URL is never used as a permanent image link.

## Storage and privacy

Photo bytes pass through bounded server memory, then upload to Google Drive.
The server verifies Drive's persisted byte count and MD5 before saving references.
Only after saving the Drive reference does it delete any legacy Supabase copy.
If cleanup fails, import reports an error; reimport retries cleanup. No background
storage staging is used. There were zero stored photos when this change was made.

Imports require an existing content-writing workspace role. An explicit checkbox authorizes
copying to Drive and anyone-with-link reader access to each imported file. The folder
is not made public. Organization sharing restrictions produce an error, not a silent
fallback to Supabase. A private uploaded Drive file may remain for the next retry.

Library preview offers **Remove photo from TrustTale**. This revokes the TrustTale
image route but leaves the customer's Drive file untouched. Delete or change sharing
on the actual file in Drive. Direct Drive links remain accessible until changed there.
Archiving is not deletion. Removing/restricting files in Drive can break journeys.

No Photos Picker token, base URL, camera metadata or location data is persisted.
Filename, original dimensions, capture date and provider item ID are stored for display
and deduplication. Drive copies use the customer's storage. Server transfer and
processing usage still apply, but no photo bytes are retained in Supabase Storage.

Run `node scripts/google-photos-test.cjs` and `node scripts/google-photos-drive-test.cjs`.
A real Google OAuth import is still needed to verify account-level API configuration.

References:
- https://developers.google.com/photos/picker/guides/media-items
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/photos/support/api-policy
- https://developers.google.com/workspace/drive/api/guides/manage-uploads
