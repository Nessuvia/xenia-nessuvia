import assert from 'node:assert'
import { dropboxCallbackRoute } from './dropboxCallback.ts'

/** Workbox matches its navigation denylist against `pathname + search`, so that's what goes in. */
const asWorkboxSeesIt = (url: string) => {
  const parsed = new URL(url, 'https://xenia.nessuvia.com')
  return parsed.pathname + parsed.search
}

// The real callback, which always carries a code. This is the case that was broken: an anchored
// pattern matched the bare path, the service worker answered the callback with index.html, and the
// popup booted the app instead of reading the code.
assert.ok(dropboxCallbackRoute.test(asWorkboxSeesIt('/dropbox.html?code=ABC123')))

// Where it actually lands: Cloudflare strips the extension and 307s, keeping the query.
assert.ok(dropboxCallbackRoute.test(asWorkboxSeesIt('/dropbox?code=ABC123')))

// A denied sign-in comes back the same way, with a reason instead of a code.
assert.ok(dropboxCallbackRoute.test(asWorkboxSeesIt('/dropbox?error=access_denied')))

// Both bare forms, which is what a direct visit looks like.
assert.ok(dropboxCallbackRoute.test('/dropbox.html'))
assert.ok(dropboxCallbackRoute.test('/dropbox'))

// Nothing else may be pulled off the SPA fallback: every one of these is an app route, and
// matching one would leave it served from the network as a 404 instead of by the router.
for (const route of ['/', '/chat', '/sync', '/dropboxes', '/dropbox-sync', '/join/abc', '/settings']) {
  assert.ok(!dropboxCallbackRoute.test(route), `${route} must stay on the SPA fallback`)
}

console.log('checkDropboxCallback ok')
