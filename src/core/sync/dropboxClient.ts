/**
 * The Dropbox half of sync. Same functions as s3Client.ts, picked between by syncClient.ts.
 *
 * The app is registered for App folder access, so Dropbox confines it to `/Apps/<app>/` and every
 * path here is relative to that. A bug in this file cannot reach the rest of the user's Dropbox.
 *
 * Hashes are Dropbox's content_hash rather than ours: a Dropbox file carries no user metadata, and
 * list_folder returns content_hash for nothing. See dropboxHash.ts.
 *
 * Outward-facing, for the same reason s3Client.ts is: every request carries a bearer token the
 * auth module owns, and threading it through core/connectors would buy nothing.
 */
import { tableNames, type TableName } from '../storage/storageInterface'
import { useSettings } from '../stores/settingsStore'
import { accessToken } from './dropboxAuth'
import { dropboxContentHash } from './dropboxHash'
import { dropboxConfigured, type DropboxConfig } from './dropboxConfig'
import { apiArg, filePath, folderPath } from './dropboxPath'
import type { Manifest, ObjectName, PulledTable } from './syncTypes'
import { imageNamePattern } from '../storage/imageRefs'

const rpc = 'https://api.dropboxapi.com/2'
const content = 'https://content.dropboxapi.com/2'

function config(): DropboxConfig {
  const c = useSettings.getState().dropbox
  if (!dropboxConfigured(c)) throw new Error("Dropbox isn't connected.")
  return c
}

interface DropboxError {
  error_summary?: string
  error?: unknown
}

/**
 * A Dropbox failure is JSON with an `error_summary` and a structured `error`. The summary alone
 * isn't enough: Dropbox truncates it with a literal `...`, so a rejected upload reads `other/...`
 * and names neither the call nor the reason. The endpoint and the full error object go in too.
 */
async function failure(endpoint: string, response: Response): Promise<Error> {
  const body = await response.text().catch(() => '')
  if (response.status === 401) {
    return new Error(
      `Dropbox rejected the sign-in on ${endpoint}. Disconnect and connect again, which is also what a change to the app's permissions needs: a token carries the scopes it was issued with.`,
    )
  }
  if (response.status === 429) return new Error('Dropbox is rate limiting this app. Try again shortly.')

  let parsed: DropboxError | null = null
  try {
    parsed = JSON.parse(body) as DropboxError
  } catch {
    // Not JSON at all, which is a gateway or a proxy answering rather than Dropbox.
    return new Error(`${endpoint} failed (${response.status}). ${body.slice(0, 200)}`.trim())
  }

  const summary = parsed.error_summary ?? ''
  // The structured half, which is where a truncated summary keeps the reason. Left off when it
  // says nothing the summary didn't, so an ordinary error doesn't grow a JSON tail.
  const detail =
    parsed.error && JSON.stringify(parsed.error) !== `{".tag":"${summary.split('/')[0]}"}`
      ? ` ${JSON.stringify(parsed.error)}`
      : ''
  return new Error(`${endpoint} failed (${response.status}): ${summary || 'no reason given'}${detail}`)
}

async function call(url: string, init: RequestInit): Promise<Response> {
  const token = await accessToken()
  try {
    return await fetch(url, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${token}` },
    })
  } catch {
    throw new Error("Couldn't reach Dropbox. Check the connection and try again.")
  }
}

/** A JSON-in, JSON-out endpoint on api.dropboxapi.com. */
async function rpcCall<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await call(`${rpc}${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await failure(endpoint, response)
  return (await response.json()) as T
}

interface FileEntry {
  '.tag': string
  name: string
  path_lower: string
  server_modified: string
  size: number
  content_hash: string
}

interface ListResult {
  entries: FileEntry[]
  cursor: string
  has_more: boolean
}

/**
 * One list of the sync folder. Unlike S3 this costs one request and no per-file follow-up:
 * content_hash comes back with the listing.
 *
 * A folder that doesn't exist yet is an empty manifest, not a failure. Dropbox creates folders on
 * the first upload, so that's the state of a fresh account with the folder field filled in.
 */
export async function fetchManifest(): Promise<Manifest> {
  const manifest: Manifest = {}
  for (const entry of await listFolder(folderPath(config()))) {
    const name = entry.name.replace(/\.json$/, '') as TableName
    // Whatever else the user keeps in the folder isn't ours to report on.
    if (name === entry.name || !tableNames.includes(name)) continue
    manifest[name] = {
      updatedAt: Date.parse(entry.server_modified) || 0,
      hash: entry.content_hash,
      size: entry.size,
    }
  }
  return manifest
}

/** Every file directly in `path`. A folder that doesn't exist yet is empty. */
async function listFolder(path: string): Promise<FileEntry[]> {
  const files: FileEntry[] = []
  let page: ListResult
  try {
    page = await rpcCall<ListResult>('/files/list_folder', { path, recursive: false })
  } catch (err) {
    if (err instanceof Error && err.message.includes('path/not_found')) return files
    throw err
  }
  for (;;) {
    files.push(...page.entries.filter((e) => e['.tag'] === 'file'))
    if (!page.has_more) break
    page = await rpcCall<ListResult>('/files/list_folder/continue', { cursor: page.cursor })
  }
  return files
}

/** Null when the file has never been pushed: Dropbox answers 409 with `path/not_found`, which is
 *  an answer rather than a failure. The hash is computed from what came back rather than read off
 *  the response, so it's the same number compare saw in the manifest. */
export async function pullTable(table: ObjectName): Promise<PulledTable | null> {
  const c = config()
  const response = await call(`${content}/files/download`, {
    method: 'POST',
    headers: { 'Dropbox-API-Arg': apiArg({ path: filePath(c, table) }) },
  })
  if (response.status === 409) {
    const error = await failure('/files/download', response)
    if (error.message.includes('path/not_found')) return null
    throw error
  }
  if (!response.ok) throw await failure('/files/download', response)
  const json = await response.text()
  return { json, hash: await dropboxContentHash(json) }
}

/**
 * The hash argument is ignored: it's our SHA-256, and Dropbox files are compared on content_hash.
 * The signature matches s3Client's so syncClient can dispatch without knowing which is running,
 * and the caller gets the right hash back to record.
 */
export async function pushTable(table: ObjectName, json: string, _hash: string): Promise<string> {
  const c = config()
  const response = await call(`${content}/files/upload`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      // `overwrite` rather than `add`: the file is this table, and Dropbox's default would rename
      // the upload to `chats (1).json` instead of replacing it. `mute` keeps sync out of the
      // user's Dropbox notifications.
      'Dropbox-API-Arg': apiArg({ path: filePath(c, table), mode: 'overwrite', mute: true }),
    },
    body: json,
  })
  if (!response.ok) throw await failure('/files/upload', response)
  return String(((await response.json()) as FileEntry).content_hash ?? '')
}

/** Images sit in an `images` folder beside the tables, named by content (imageRefs.ts). */
function imagePath(c: DropboxConfig, name: string): string {
  return `${folderPath(c)}/images/${name}`
}

export async function listImages(): Promise<Set<string>> {
  const entries = await listFolder(`${folderPath(config())}/images`)
  return new Set(entries.map((e) => e.name).filter((n) => imageNamePattern.test(n)))
}

export async function pushImage(name: string, bytes: Uint8Array): Promise<void> {
  const response = await call(`${content}/files/upload`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      // A name is its content, so overwriting an existing one writes the same bytes.
      'Dropbox-API-Arg': apiArg({ path: imagePath(config(), name), mode: 'overwrite', mute: true }),
    },
    body: bytes as Uint8Array<ArrayBuffer>,
  })
  if (!response.ok) throw await failure('/files/upload', response)
}

/** Null when Dropbox doesn't have it. */
export async function pullImage(name: string): Promise<Uint8Array | null> {
  const response = await call(`${content}/files/download`, {
    method: 'POST',
    headers: { 'Dropbox-API-Arg': apiArg({ path: imagePath(config(), name) }) },
  })
  if (response.status === 409) {
    const error = await failure('/files/download', response)
    if (error.message.includes('path/not_found')) return null
    throw error
  }
  if (!response.ok) throw await failure('/files/download', response)
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * The Connect button's follow-up check. Uploading and deleting a probe file, the way the S3 test
 * does, would prove less here: there's no CORS policy to get wrong and no metadata round trip to
 * verify. Listing the folder is the thing that can actually fail, through a revoked token or a
 * folder name Dropbox won't take.
 */
export async function testDropbox(): Promise<void> {
  await fetchManifest()
}
