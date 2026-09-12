// Tavern character cards are PNGs with the card JSON stashed in a tEXt chunk, base64-encoded,
// keyed "chara" (v2) or "ccv3" (v3). We read the JSON out of that chunk; the PNG itself becomes
// the avatar. No deps: a PNG is a signature plus length/type/data/crc chunks.

// Both halves of a tEXt chunk are ASCII (a latin1 keyword, then base64): one UTF-8 decoder
// reads either. It replaces `String.fromCharCode(...bytes)`: a card carrying a lorebook has a
// payload around 100 KB, and spreading that many arguments overflows the call stack in Chrome.
const ascii = new TextDecoder()

/** Returns the base64 payload of the first tEXt chunk with this keyword, or null. */
function readTextChunk(bytes: Uint8Array, keyword: string): string | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let i = 8 // skip the 8-byte PNG signature
  while (i + 8 <= bytes.length) {
    const len = dv.getUint32(i)
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7])
    if (type === 'tEXt') {
      const data = bytes.subarray(i + 8, i + 8 + len)
      const nul = data.indexOf(0)
      if (nul !== -1) {
        if (ascii.decode(data.subarray(0, nul)) === keyword) {
          return ascii.decode(data.subarray(nul + 1))
        }
      }
    }
    i += 12 + len // length(4) + type(4) + data(len) + crc(4)
  }
  return null
}

/** The PNG as a data URL, for use as the avatar. */
export function pngDataUrl(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return `data:image/png;base64,${btoa(binary)}`
}

/** Parses the card JSON embedded in a Tavern PNG. Throws if none is present. */
export function parsePngCard(buffer: ArrayBuffer): unknown {
  const bytes = new Uint8Array(buffer)
  // ccv3 wins when both are present: it's the newer, fuller record. Two passes rather than one:
  // a single pass would return whichever chunk came first in the file.
  const b64 = readTextChunk(bytes, 'ccv3') ?? readTextChunk(bytes, 'chara')
  if (!b64) throw new Error('No character data in this PNG')
  const json = decodeURIComponent(escape(atob(b64))) // atob → latin1; this recovers UTF-8
  return JSON.parse(json)
}
