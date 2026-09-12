/**
 * What a failed `fetch` should say. The browser reports a blocked cross-origin request and an
 * unreachable host identically, as a bare TypeError with no detail. The page is not allowed to
 * know which one happened. Both causes get named: neither can be ruled out from here.
 */
export function describeFetchError(err: unknown, url: string): string {
  if (!(err instanceof TypeError)) return (err as Error)?.message ?? String(err)
  let origin = url
  try {
    origin = new URL(url).origin
  } catch {
    // A malformed URL is its own answer; the message below still names what was tried.
  }
  return `No response from ${origin}. The server is not running, or it is not sending CORS headers for this page.`
}
