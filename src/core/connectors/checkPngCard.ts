// The tEXt-chunk reader, against a real Tavern PNG in src/assets/testAssets.
// Run: node --experimental-strip-types src/core/connectors/checkPngCard.ts
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { parsePngCard, pngDataUrl } from './pngCard.ts'

/** The file as an ArrayBuffer, the shape both functions take. Base64 in, no Buffer typing. */
function readPng(name: string): ArrayBuffer {
  const b64 = readFileSync(new URL(`../../assets/testAssets/${name}`, import.meta.url), 'base64')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

const png = readPng('nessuvia.png')
const card = parsePngCard(png) as { data?: { name?: string } }

assert.ok(card.data?.name, 'the card JSON comes out of the tEXt chunk')

// The avatar half. A data URL that round-trips back to the same bytes is the whole contract.
const url = pngDataUrl(png)
assert.ok(url.startsWith('data:image/png;base64,'))
assert.equal(atob(url.slice('data:image/png;base64,'.length)).length, png.byteLength)

// A PNG with no card chunk is not a card. Signature plus one empty IEND, and nothing else.
const empty = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0])
assert.throws(() => parsePngCard(empty.buffer), /No character data/)

console.log('checkPngCard: ok')
