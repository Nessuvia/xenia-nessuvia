/**
 * Cloudflare R2's S3 endpoint is the account ID in a fixed hostname. The Online Sync form asks
 * for the account ID and stores the endpoint the sync client already understands. Nothing else in
 * core/sync knows R2 exists.
 *
 * Explicit .ts extensions below: checkR2Endpoint.ts imports this under node --strip-types.
 */

const r2Host = '.r2.cloudflarestorage.com'

/** R2 ignores the region. SigV4 signs it: it has to be the value R2 expects. */
export const r2Region = 'auto'

/** '' for a blank account ID, not a hostname with nothing in front of it: that would read as a
 *  filled-in endpoint to bucketConfigured and enable Test connection on an empty form. */
export function r2Endpoint(accountId: string): string {
  const id = accountId.trim()
  return id ? `https://${id}${r2Host}` : ''
}

/**
 * The account ID back out of a stored endpoint, or null when the endpoint is some other S3 server.
 * That null decides whether the form opens in R2 mode or in the generic one. It has to say no to a
 * lookalike host: only the exact suffix on the hostname counts, not a substring of the whole URL.
 */
export function r2AccountId(endpoint: string): string | null {
  let host: string
  try {
    host = new URL(endpoint).hostname
  } catch {
    return null
  }
  if (!host.endsWith(r2Host)) return null
  const id = host.slice(0, -r2Host.length)
  // A bare `r2.cloudflarestorage.com` has no account in it, and an id with a dot is a deeper
  // subdomain rather than an account.
  return id && !id.includes('.') ? id : null
}
