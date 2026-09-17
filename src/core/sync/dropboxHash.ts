/**
 * Dropbox's content_hash, computed locally.
 *
 * S3 carries our SHA-256 as object metadata; Dropbox has no user metadata on a file, so compare
 * needs a hash both sides can produce from the bytes alone. list_folder already returns
 * content_hash for free, so the cheap answer is to compute the same thing here instead of keeping
 * a manifest file in sync alongside the data.
 *
 * The algorithm, from Dropbox's docs: SHA-256 each 4 MB block, concatenate the raw digests, and
 * SHA-256 that. An empty file hashes the empty concatenation, which is SHA-256 of nothing.
 *
 * Extension-ful import: checkDropboxHash.ts runs this under node --experimental-strip-types.
 */

const blockSize = 4 * 1024 * 1024

function hex(digest: ArrayBuffer): string {
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function dropboxContentHash(json: string): Promise<string> {
  const bytes = new TextEncoder().encode(json)
  const digests = new Uint8Array(Math.ceil(bytes.length / blockSize) * 32)
  for (let offset = 0, at = 0; offset < bytes.length; offset += blockSize, at += 32) {
    const block = bytes.subarray(offset, offset + blockSize)
    digests.set(new Uint8Array(await crypto.subtle.digest('SHA-256', block)), at)
  }
  return hex(await crypto.subtle.digest('SHA-256', digests))
}
