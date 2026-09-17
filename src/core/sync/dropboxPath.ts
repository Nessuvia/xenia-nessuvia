/**
 * Where a table lives in the app folder, and how that path travels to Dropbox.
 *
 * Pure, and split out from dropboxClient.ts so checkDropboxPath.ts can run it under
 * `node --experimental-strip-types`: the client reaches settingsStore and Dexie through it.
 */
import type { DropboxConfig } from './dropboxConfig.ts'

/** Dropbox wants a leading slash and no trailing one, and '' for the app folder's own root. A
 *  folder of '/', 'books' or 'books/' has to come out the same. */
export function folderPath(c: DropboxConfig): string {
  const folder = c.folder.replace(/^\/+|\/+$/g, '')
  return folder ? `/${folder}` : ''
}

export function filePath(c: DropboxConfig, name: string): string {
  return `${folderPath(c)}/${name}.json`
}

/**
 * The path travels in the `Dropbox-API-Arg` header, and a header can only carry ASCII. Dropbox
 * documents the escape: anything outside printable ASCII as a \uXXXX sequence. Reached by a
 * folder name with an accent in it.
 *
 * Written as a character walk rather than a regex with an escaped range: the range spelled
 * `-￿` kept getting rewritten on disk into the literal control characters it stands
 * for, which still worked and was unreadable. This version is plain ASCII in source.
 */
export function apiArg(value: unknown): string {
  const json = JSON.stringify(value)
  let out = ''
  // Walked by code unit rather than by code point: `\uXXXX` describes a UTF-16 unit, so a
  // character outside the BMP has to come out as both halves of its surrogate pair. Spreading the
  // string instead iterates whole code points, and charCodeAt then reads the high surrogate and
  // drops the low one, which silently sends the file to a different path.
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i)
    out += code > 0x7e ? `\\u${code.toString(16).padStart(4, '0')}` : json[i]
  }
  return out
}
