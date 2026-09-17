import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { dropboxContentHash } from './dropboxHash.ts'

/** The same algorithm written the obvious slow way, so the check fails if the block loop in
 *  dropboxHash.ts is wrong rather than agreeing with itself. */
function expected(json: string): string {
  const bytes = Buffer.from(json, 'utf8')
  const digests: Buffer[] = []
  for (let at = 0; at < bytes.length; at += 4 * 1024 * 1024) {
    digests.push(createHash('sha256').update(bytes.subarray(at, at + 4 * 1024 * 1024)).digest())
  }
  return createHash('sha256').update(Buffer.concat(digests)).digest('hex')
}

// One block, which is every table this app will realistically push.
assert.equal(await dropboxContentHash('{"rows":[]}'), expected('{"rows":[]}'))

// An empty file is the concatenation of no digests, which is SHA-256 of nothing. Reached when a
// table is emptied and pushed.
assert.equal(await dropboxContentHash(''), createHash('sha256').update(Buffer.alloc(0)).digest('hex'))

// Exactly on the boundary: one block, not two with an empty second.
const exact = 'a'.repeat(4 * 1024 * 1024)
assert.equal(await dropboxContentHash(exact), expected(exact))

// Over the boundary, where a single-digest implementation would quietly agree with the wrong
// answer. This is the case the block loop exists for.
const over = 'a'.repeat(4 * 1024 * 1024 + 7)
assert.equal(await dropboxContentHash(over), expected(over))
assert.notEqual(await dropboxContentHash(over), createHash('sha256').update(Buffer.from(over)).digest('hex'))

// Multi-byte characters are hashed as their UTF-8 bytes, not their code units: the block boundary
// is a byte offset and a character can straddle it.
const wide = '\u{1f600}'.repeat(10)
assert.equal(await dropboxContentHash(wide), expected(wide))

console.log('checkDropboxHash ok')
