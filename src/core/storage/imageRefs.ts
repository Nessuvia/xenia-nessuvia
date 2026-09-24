/**
 * Images leave the browser as files rather than as base64 inside a row. Dexie keeps storing data
 * URLs, so nothing that renders an image changes: the swap happens only at the file boundary (a ZIP
 * backup, a sync push or pull).
 *
 * An image is named by the SHA-256 of its bytes, `<hash>.<ext>`, and the row carries
 * `nessuImage:<hash>.<ext>` in its place. A name never changes meaning, so sync uploads one only
 * when the bucket lacks it, and two cards sharing an avatar share one file.
 *
 * The walk is generic: any string field that is an entire base64 `data:image/...` URL is swapped,
 * wherever it sits in a row. Avatars and background images today, whatever gains an image later.
 *
 * Pure, extension-ful imports: checkImageRefs.ts runs it under node --experimental-strip-types.
 */
import type { StoredRecord } from './storageInterface.ts'

const refPrefix = 'nessuImage:'
const dataUrlPattern = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]*)$/
/** Also the only names a ZIP or a bucket may hand back to inlineImages. */
export const imageNamePattern = /^[0-9a-f]{64}\.[a-z0-9]+$/
const refPattern = /nessuImage:([0-9a-f]{64}\.[a-z0-9]+)/g

const extByMime: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
}
const mimeByExt = Object.fromEntries(Object.entries(extByMime).map(([m, e]) => [e, m]))

export function mimeOf(name: string): string {
  return mimeByExt[name.slice(name.lastIndexOf('.') + 1)] ?? 'application/octet-stream'
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  // Chunked: String.fromCharCode spread over a multi-megabyte wallpaper overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Deep map over every string in a JSON-shaped value. */
async function mapStrings(value: unknown, fn: (s: string) => Promise<string>): Promise<unknown> {
  if (typeof value === 'string') return fn(value)
  if (Array.isArray(value)) return Promise.all(value.map((v) => mapStrings(v, fn)))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = await mapStrings(v, fn)
    return out
  }
  return value
}

/**
 * Rows with every image swapped for a ref, plus the bytes behind them, keyed by name. `images` is
 * shared so one call per table can fill a single map for a whole backup.
 */
export async function extractImages(
  rows: StoredRecord[],
  images: Map<string, Uint8Array> = new Map(),
): Promise<{ rows: StoredRecord[]; images: Map<string, Uint8Array> }> {
  const out = (await mapStrings(rows, async (s) => {
    const match = dataUrlPattern.exec(s)
    // An unknown image type stays inline: it has no extension to be named with, and a row that
    // works beats a file that doesn't.
    const ext = match && extByMime[match[1]]
    if (!match || !ext) return s
    const bytes = fromBase64(match[2])
    const name = `${await sha256(bytes)}.${ext}`
    images.set(name, bytes)
    return refPrefix + name
  })) as StoredRecord[]
  return { rows: out, images }
}

/** The reverse. A ref whose file is missing becomes '', which every image field reads as unset. */
export async function inlineImages(
  rows: StoredRecord[],
  images: Map<string, Uint8Array>,
): Promise<StoredRecord[]> {
  return (await mapStrings(rows, async (s) => {
    if (!s.startsWith(refPrefix)) return s
    const name = s.slice(refPrefix.length)
    const bytes = images.get(name)
    return bytes ? `data:${mimeOf(name)};base64,${toBase64(bytes)}` : ''
  })) as StoredRecord[]
}

/**
 * Every image name a serialized table refers to. The orphan finder is this over every table,
 * subtracted from what the bucket lists.
 */
export function referencedImages(json: string): Set<string> {
  return new Set([...json.matchAll(refPattern)].map((m) => m[1]))
}
