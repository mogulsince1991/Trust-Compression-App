# Google Photos import

Library > Add content > Google Photos imports up to 100 selected photos per session.
Owners/admins can connect; viewers cannot import. Google Picker lets people search
albums and select their contents, but this is not a live album/folder subscription.
Videos are skipped. Existing Drive/YouTube video playback is unchanged.

## Google Cloud setup required

1. Enable the Google Photos Picker API in the OAuth client's Google Cloud project.
2. Use a Web application OAuth client. Configure `GOOGLE_PHOTOS_CLIENT_ID` in Vercel
   (the existing Google client ID is a fallback; no client secret is sent to the browser).
3. Add the exact authorized JavaScript origins used by customers:
   `https://app.trusttale.co`, `https://trusttale.co`, and
   `https://trustcompression.unmarked.media` where applicable. No paths or trailing slash.
4. Configure OAuth consent for
   `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`.
   Add test users while testing; complete Google's publication/verification requirements
   before making access generally available. Review the Photos API developer policies
   against your intended use and update your public privacy policy.
5. Deploy after environment changes. Test sign-in, multi-selection, import, repeat
   import, image display in a published journey, and permanent deletion.

The browser token model does not need a new server callback URL. Google credentials
are held in component memory, not persisted in a workspace, database or browser storage.
Imported image copies are bounded to 2048px and 10 MB each; this is not original-file backup.
The Google API URL is never used as a permanent image link.

## Storage and privacy

The private `library-photos` bucket only accepts supported raster image types. Server
requests authenticate membership and require workspace owner/admin permissions.
Each saved copy has a random 256-bit share capability. Anyone who receives that image
link (including through a journey) can view it. An explicit checkbox explains copying
and sharing before OAuth/import. Do not use this for sensitive private documents.

Library preview offers **Permanently delete photo copy**. This removes stored bytes
and revokes the copy's media route, including existing journey references. Existing
signed URLs expire within five minutes. Archiving is not deletion and leaves journey
links working. Reimporting a deleted photo creates a new capability.

No Google account token, base URL, camera metadata or location data is persisted.
Filename, original dimensions, capture date and provider item ID are stored for display
and deduplication. Storage/bandwidth costs apply to the imported copies.

References:
- https://developers.google.com/photos/picker/guides/media-items
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/photos/support/api-policy
