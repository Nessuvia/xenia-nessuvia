/**
 * Which URLs the Dropbox OAuth callback can arrive at, as one pattern shared by vite.config.ts and
 * checkDropboxCallback.ts.
 *
 * Its own file because getting this wrong is invisible: the service worker answers the callback
 * with index.html, the popup boots the whole app, lands on the default route, and the sign-in
 * silently does nothing. Every part of the stack looks healthy from outside.
 *
 * Two spellings and an optional query:
 * - `/dropbox.html` is what the app registers and what Dropbox redirects to.
 * - `/dropbox` is where it ends up: Cloudflare's asset server strips the extension with a 307.
 * - `?code=...` is always attached, and workbox tests its denylist against `pathname + search`,
 *   so a `$`-anchored pattern matches the bare path and never a real callback.
 */
export const dropboxCallbackRoute = /^\/dropbox(\.html)?(\?|$)/
