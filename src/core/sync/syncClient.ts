/**
 * Sync's only outward-facing file: one S3-compatible bucket, supplied by the user.
 *
 * There is no account and no server of ours. The bucket is the identity: whoever holds its keys
 * holds the data, and it lives wherever the user put it (Garage, Backblaze B2, any S3 API).
 * Nothing here knows about sign-in, because there is nothing to sign in to.
 *
 * CLAUDE.md puts network calls in core/connectors/, and this file breaks that: the fetch wrapper
 * lives here rather than there. Every request has to be SigV4-signed with the bucket credentials.
 * Splitting it out would mean threading a signer through every call for no gain. One file that
 * talks outward is the boundary that matters. core/connectors/ stays what it is: the model
 * endpoint.
 *
 * Note: src/core/multiplayer/centrifugoChannel.ts is the app's other outward file. It is
 * unrelated: an ephemeral relay, no storage.
 */
import { AwsClient } from 'aws4fetch'
import { tableNames, type TableName } from '../storage/storageInterface'
import { useSettings } from '../stores/settingsStore'
import { bucketConfigured, type BucketConfig } from './bucketConfig'

function config(): BucketConfig {
  const c = useSettings.getState().bucket
  if (!bucketConfigured(c)) throw new Error('No bucket is configured.')
  return c
}

// Rebuilt whenever the credentials change rather than cached: the config is edited by hand on the
// Sync screen, and an AwsClient is cheap enough that holding a stale one is the only real risk.
function signer(c: BucketConfig): AwsClient {
  return new AwsClient({
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    service: 's3',
    region: c.region,
  })
}

/** Path-style addressing (`endpoint/bucket/key`), not virtual-host style. Garage always accepts
 *  path-style, vhost-style needs a wildcard DNS entry it may not have, and AWS takes either. */
function objectUrl(c: BucketConfig, key: string): string {
  const base = c.endpoint.replace(/\/+$/, '')
  return `${base}/${encodeURIComponent(c.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`
}

/** Takes a plain name, not a TableName: the Test button's probe object lives at the same prefix
 *  and is not a table. */
function objectKey(c: BucketConfig, name: string): string {
  const prefix = c.prefix.replace(/^\/+|\/+$/g, '')
  return prefix ? `${prefix}/${name}.json` : `${name}.json`
}

/** Our own SHA-256 of the payload, carried as object metadata. S3's ETag is not a substitute: it is
 *  MD5, and settings.tableHashes holds SHA-256. */
const hashMeta = 'x-amz-meta-hash'

const missingHash =
  "The bucket did not return the stored hash. Add x-amz-meta-hash to the bucket's CORS ExposeHeaders, and check that the server keeps object metadata."

export interface TableManifestEntry {
  updatedAt: number
  hash: string | null
  size: number
}

/** A table that has never been pushed is absent, so a missing key means nothing in the bucket. */
export type Manifest = Partial<Record<TableName, TableManifestEntry>>

export interface PulledTable {
  json: string
  hash: string
}

/** S3 errors are XML, not JSON. The message element is the useful part; the status is the fallback
 *  for a bucket that returns an empty body. */
async function failure(response: Response): Promise<Error> {
  const body = await response.text().catch(() => '')
  const message = /<Message>([^<]*)<\/Message>/.exec(body)?.[1]
  if (response.status === 403) {
    return new Error(message ?? 'The bucket rejected the credentials (403).')
  }
  return new Error(message ?? `Request failed (${response.status}).`)
}

/**
 * A signed request that reports a blocked preflight as itself. A browser CORS failure surfaces as
 * a TypeError with no status, which looks like "network down" and sends people looking in the wrong
 * place. The bucket's CORS policy is the usual cause and the message says so.
 */
async function signedFetch(url: string, init: RequestInit, c: BucketConfig): Promise<Response> {
  try {
    return await signer(c).fetch(url, init)
  } catch {
    throw new Error(
      'Could not reach the bucket. Check the endpoint, and that the bucket allows requests from this site (CORS).',
    )
  }
}

/** A bucket with more objects than one list page holds answers `IsTruncated` and a continuation
 *  token. Bounded rather than a bare `while`: a server that keeps returning a token would otherwise
 *  spin forever, and a thousand pages is already far past any bucket this app should be reading. */
const maxListPages = 1000

/**
 * One ListObjectsV2 for what exists, then a HEAD per present table for its hash: a list response
 * carries size and LastModified but never user metadata. Thirteen HEADs on a button press is a fine
 * price for not inventing a second hash scheme.
 *
 * The list is paged through to the end. With an empty `prefix` our fifteen objects share the bucket
 * root with whatever else the user keeps there, and a page that truncates before reaching them
 * would report those tables as absent: compare would then call every one of them local-only and
 * offer to upload over the bucket's copy.
 */
export async function fetchManifest(): Promise<Manifest> {
  const c = config()
  const prefix = c.prefix.replace(/^\/+|\/+$/g, '')
  const base = `${c.endpoint.replace(/\/+$/, '')}/${encodeURIComponent(c.bucket)}?list-type=2${
    prefix ? `&prefix=${encodeURIComponent(prefix + '/')}` : ''
  }`

  const present = new Map<TableName, { updatedAt: number; size: number }>()
  let token: string | null = null
  for (let page = 0; page < maxListPages; page++) {
    const listUrl: string =
      token === null ? base : `${base}&continuation-token=${encodeURIComponent(token)}`
    const response: Response = await signedFetch(listUrl, { method: 'GET' }, c)
    if (!response.ok) throw await failure(response)

    // Parsed as XML rather than by regex: the key is user-controlled through `prefix`.
    const doc = new DOMParser().parseFromString(await response.text(), 'application/xml')
    for (const node of doc.getElementsByTagName('Contents')) {
      const key = node.getElementsByTagName('Key')[0]?.textContent ?? ''
      const name = key.slice(key.lastIndexOf('/') + 1).replace(/\.json$/, '') as TableName
      // Anything else living at this prefix is not ours to report: the Test button's probe object,
      // or whatever the user keeps alongside. The key must match exactly, folders included.
      if (!tableNames.includes(name) || key !== objectKey(c, name)) continue
      present.set(name, {
        updatedAt: Date.parse(node.getElementsByTagName('LastModified')[0]?.textContent ?? '') || 0,
        size: Number(node.getElementsByTagName('Size')[0]?.textContent ?? 0),
      })
    }

    // The token decides whether to continue. A page that says truncated has nowhere to send us
    // without one, and an S3 clone that omits the flag but supplies a token still has more to
    // give. A token that repeats means the server is not advancing. Stop rather than loop.
    const next = doc.getElementsByTagName('NextContinuationToken')[0]?.textContent ?? ''
    if (!next || next === token) break
    token = next
  }

  const manifest: Manifest = {}
  for (const [table, entry] of present) {
    const head = await signedFetch(objectUrl(c, objectKey(c, table)), { method: 'HEAD' }, c)
    // A table that vanished between the list and the head is simply not in the manifest.
    if (!head.ok) continue
    const hash = head.headers.get(hashMeta)
    // Compare is built on this hash. Without it every table looks like changed in the bucket and the
    // screen would keep proposing downloads that overwrite local work, a wrong answer delivered
    // confidently. Two causes, indistinguishable from the browser: the message names both.
    if (hash === null) throw new Error(missingHash)
    manifest[table] = { ...entry, hash }
  }
  return manifest
}

/**
 * Null when the table has never been pushed: the 404 is an answer, not a failure.
 *
 * Takes a plain name for the same reason objectKey does: the settings blob rides in the same
 * bucket as `settings.json` and is not a table.
 */
export async function pullTable(table: TableName | 'settings'): Promise<PulledTable | null> {
  const c = config()
  const response = await signedFetch(objectUrl(c, objectKey(c, table)), { method: 'GET' }, c)
  if (response.status === 404) return null
  if (!response.ok) throw await failure(response)
  const hash = response.headers.get(hashMeta)
  // Recorded as this table's synced hash. A blank would make every later compare wrong. Reached
  // when "Download all" skips the compare that would otherwise have caught it.
  if (hash === null) throw new Error(missingHash)
  return { json: await response.text(), hash }
}

/** The bucket stamps LastModified from its own clock; the hash rides along as object metadata. */
export async function pushTable(table: TableName | 'settings', json: string, hash: string) {
  const c = config()
  const response = await signedFetch(
    objectUrl(c, objectKey(c, table)),
    { method: 'PUT', headers: { 'content-type': 'application/json', [hashMeta]: hash }, body: json },
    c,
  )
  if (!response.ok) throw await failure(response)
}

/**
 * The Test button. Writes a small probe object, reads its metadata back, and deletes it.
 *
 * A plain list would prove less than it appears to. Sync's compare rests on `x-amz-meta-hash`
 * surviving a PUT and coming back on a HEAD, and that is the one thing an S3-compatible server may
 * not do. It is not part of the endpoint list servers advertise, and the browser needs the CORS
 * expose list on top of it. Round-tripping the header is the only way to find out from here, and
 * finding out on a button press beats finding out mid-sync.
 */
export async function testBucket(c: BucketConfig): Promise<void> {
  const url = objectUrl(c, objectKey(c, 'probe'))
  const probe = 'nessuTavern probe'

  const put = await signedFetch(
    url,
    { method: 'PUT', headers: { 'content-type': 'text/plain', [hashMeta]: probe }, body: probe },
    c,
  )
  if (!put.ok) throw await failure(put)

  try {
    const head = await signedFetch(url, { method: 'HEAD' }, c)
    if (!head.ok) throw await failure(head)
    if (head.headers.get(hashMeta) !== probe) throw new Error(missingHash)
  } finally {
    // Best effort: a bucket that refuses deletes still syncs, and one stray probe object is not
    // worth failing a passing test over.
    await signedFetch(url, { method: 'DELETE' }, c).catch(() => undefined)
  }
}
