/**
 * Whether a browser will refuse to reach an endpoint because the page is https and the endpoint
 * isn't. Nothing in this app can lift that: it's enforced below fetch, a service worker is bound
 * by the same rule, and there's no flag or header that turns it off for one origin. The only
 * thing worth doing is saying so where the URL is typed, the way `multiplayer/relayConfig.ts`
 * refuses a `ws://` relay.
 *
 * Loopback is the exception. Browsers treat `http://localhost`, `http://127.0.0.0/8` and
 * `http://[::1]` as potentially trustworthy, so a model served there's reachable from an https
 * page. A LAN or VPN address (`192.168.x`, `10.x`, a ZeroTier IP) isn't, and that's the case
 * this catches.
 *
 * No imports: `checkMixedContent.ts` runs under node --strip-types.
 */

/** A host the browser counts as a secure origin over plain http. */
export function loopbackHost(host: string): boolean {
  // `new URL().hostname` keeps IPv6 in brackets and lowercases the rest.
  const h = host.replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '::1') return true
  return /^127(\.\d{1,3}){3}$/.test(h)
}

/**
 * True when `pageProtocol` is https, `endpointUrl` is plain http, and its host isn't loopback.
 * An empty or unparseable URL is false: that's the field's own problem, not this one.
 */
export function mixedContentBlocked(endpointUrl: string, pageProtocol: string): boolean {
  if (pageProtocol !== 'https:') return false
  let url: URL
  try {
    url = new URL(endpointUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'http:') return false
  return !loopbackHost(url.hostname)
}
