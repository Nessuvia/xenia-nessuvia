/**
 * Every request sync makes. syncStore.ts decides what moves, and this file moves it.
 *
 * The app is registered for App folder access, so Dropbox confines it to `/Apps/<app>/` and every
 * path here is relative to that. A bug in this file cannot reach the rest of the user's Dropbox.
 *
 * Hashes are Dropbox's content_hash rather than ours: a Dropbox file carries no user metadata, and
 * list_folder returns content_hash for nothing. See dropboxHash.ts.
 *
 * Outward-facing on purpose: every request carries a bearer token the auth module owns, and
 * threading it through core/connectors would buy nothing.
 */
import { useSettings } from '../stores/settingsStore'
import { accessToken } from './dropboxAuth'
import { dropboxConfigured, type DropboxConfig } from './dropboxConfig'
import { apiArg, filePath, folderPath } from './dropboxPath'

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
  path_display: string
  server_modified: string
  size: number
  content_hash: string
}

interface ListResult {
  entries: FileEntry[]
  cursor: string
  has_more: boolean
}

export interface CloudFile {
  hash: string
  updatedAt: number
}

/**
 * Every file under the sync folder, keyed by its path inside it (`characters/3/card.json`). One
 * recursive listing, paged: content_hash comes back with each entry, so compare downloads nothing.
 *
 * A folder that doesn't exist yet is empty, not a failure. Dropbox creates folders on the first
 * upload, so that's the state of a fresh account with the folder field filled in.
 */
export async function listFiles(): Promise<Map<string, CloudFile>> {
  const root = folderPath(config())
  const files = new Map<string, CloudFile>()
  for (const entry of await listFolder(root, true)) {
    // path_display rather than path_lower: table names are camelCase, and the prefix is cut by
    // length so the folder's own casing doesn't matter.
    files.set(entry.path_display.slice(root.length + 1), {
      hash: entry.content_hash,
      updatedAt: Date.parse(entry.server_modified) || 0,
    })
  }
  return files
}

/** Every file under `path`. A folder that doesn't exist yet is empty. */
async function listFolder(path: string, recursive: boolean): Promise<FileEntry[]> {
  const files: FileEntry[] = []
  let page: ListResult
  try {
    page = await rpcCall<ListResult>('/files/list_folder', { path, recursive })
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

/** Null when the file isn't there: Dropbox answers 409 with `path/not_found`, which is an answer
 *  rather than a failure. */
export async function pullFile(path: string): Promise<Uint8Array | null> {
  const response = await call(`${content}/files/download`, {
    method: 'POST',
    headers: { 'Dropbox-API-Arg': apiArg({ path: filePath(config(), path) }) },
  })
  if (response.status === 409) {
    const error = await failure('/files/download', response)
    if (error.message.includes('path/not_found')) return null
    throw error
  }
  if (!response.ok) throw await failure('/files/download', response)
  return new Uint8Array(await response.arrayBuffer())
}

/** Returns the content_hash Dropbox computed, which is what the next listing will show. */
export async function pushFile(path: string, body: string | Uint8Array): Promise<string> {
  const response = await call(`${content}/files/upload`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      // `overwrite` rather than `add`: Dropbox's default would rename the upload to `card (1).json`
      // instead of replacing it. `mute` keeps sync out of the user's Dropbox notifications.
      'Dropbox-API-Arg': apiArg({ path: filePath(config(), path), mode: 'overwrite', mute: true }),
    },
    body: body as string | Uint8Array<ArrayBuffer>,
  })
  if (!response.ok) throw await failure('/files/upload', response)
  return String(((await response.json()) as FileEntry).content_hash ?? '')
}

/** A file that's already gone is the outcome asked for. */
export async function deleteFile(path: string): Promise<void> {
  try {
    await rpcCall('/files/delete_v2', { path: filePath(config(), path) })
  } catch (err) {
    if (err instanceof Error && err.message.includes('not_found')) return
    throw err
  }
}

/**
 * The Connect button's follow-up check. Listing the folder is the thing that can actually fail,
 * through a revoked token or a folder name Dropbox won't take.
 */
export async function testDropbox(): Promise<void> {
  await listFolder(folderPath(config()), false)
}
