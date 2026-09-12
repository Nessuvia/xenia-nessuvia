/**
 * Which relay a session runs on. On its own: the settings store and the channel code import
 * it without a cycle, the same way `sync/bucketConfig.ts` sits between settings and the sync client.
 *
 * No imports of its own: `checkRelayConfig.ts` runs under node --strip-types.
 */

export interface RelayConfig {
  /** The Centrifugo websocket endpoint, e.g. `wss://relay.example.net/connection/websocket`. */
  url: string
}

/** No relay until the user enters one. */
export const emptyRelayConfig: RelayConfig = { url: '' }

/** Whether this config can open a channel. */
export function relayConfigured(c: RelayConfig): boolean {
  return validRelayUrl(c.url)
}

/**
 * `wss://` only. This runs on the invite link's `?r=`, which is untrusted input arriving from
 * whoever sent the link: the same rule as an imported card. `ws://` is rejected rather than
 * allowed and left to fail: the app is served over https, and a browser blocks the plaintext
 * socket as mixed content anyway. Saying so early beats a silent connection failure.
 */
export function validRelayUrl(url: string): boolean {
  if (!url) return false
  try {
    return new URL(url).protocol === 'wss:'
  } catch {
    return false
  }
}

/** The relay's hostname, for the notice to name. '' when the URL is unusable. */
export function relayHost(config: RelayConfig): string {
  try {
    return new URL(config.url).host
  } catch {
    return ''
  }
}

/** The invite link for a session. The relay travels on it: only the host has it configured. */
export function inviteLink(origin: string, sessionId: string, config: RelayConfig): string {
  return `${origin}/join/${sessionId}?r=${encodeURIComponent(config.url)}`
}

/** The relay a guest should use, from the `r` parameter on the link they opened. An `r` that is
 *  missing or not a valid wss URL is undefined, and the guest is told the link is bad rather than
 *  pointed at whatever it said. */
export function relayFromLink(r: string | null): RelayConfig | undefined {
  if (!r || !validRelayUrl(r)) return undefined
  return { url: r }
}
