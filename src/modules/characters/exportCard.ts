// Character export: a Tavern v2/v3 card. Our own fields ride along in `data.extensions`. Readers
// that don't know them ignore them, and importCard() reads them back.
import type { Character, Lorebook, WorldInfoEntry } from '../../core/storage/types'
import { bookOf, cardData } from './importCard.ts' // explicit extension: checkImportCard.ts imports this file under node

type Loose = Record<string, unknown>

const obj = (v: unknown) =>(v && typeof v === 'object' && !Array.isArray(v) ? (v as Loose) : {})

/**
 * The `character_book` half of the card. Each entry's untouched `raw` is preferred, so everything
 * this app doesn't model (secondary_keys, selective, probability, position, extensions) leaves
 * exactly as it arrived. Hand-authored entries have no `raw` and get a minimal spec entry.
 *
 * The two book-level flags we don't model come off the original book for the same reason.
 *
 * `book` is the character's first attached lorebook. A card has one `character_book`, so with
 * several attached the rest are left out rather than merged into a book they never belonged to.
 */
function buildBook(c: Character, entries: WorldInfoEntry[], book?: Lorebook) {
  if (!entries.length && !book) return undefined
  const was = bookOf(c.rawCard) ?? {}
  return {
    name: book?.name ?? '',
    description: book?.description ?? '',
    scan_depth: book?.scanDepth,
    token_budget: book?.tokenBudget,
    recursive_scanning: was.recursive_scanning === true,
    extensions: obj(was.extensions),
    entries: entries.map((e, index) =>
      e.raw && typeof e.raw === 'object'
        ? e.raw
        : {
            keys: e.keys,
            secondary_keys: e.secondaryKeys ?? [],
            selective: (e.secondaryKeys ?? []).length > 0,
            selectiveLogic: e.selectiveLogic ?? 0,
            case_sensitive: e.caseSensitive === true,
            content: e.content,
            comment: e.name,
            constant: e.always,
            enabled: e.enabled,
            insertion_order: e.order ?? index,
            // SillyTavern's numbering, the same one importLorebook reads back.
            position: e.position === 'beforeChar' ? 0 : e.position === 'atDepth' ? 4 : 1,
            depth: e.depth,
            extensions: e.scanDepth === undefined ? {} : { scan_depth: e.scanDepth },
          },
    ),
  }
}

/** The card JSON, spec'd as v2 with a v3 marker so both readers find their fields.
 *
 *  Every spec field is written off the Character record. importCard fills all of them on the way
 *  in, so a value that arrived on a card is on the record too. `rawCard` is still consulted for
 *  what this app does NOT model: foreign `extensions` keys and the book's own flags. The spec
 *  forbids destroying data that was already there. */
export function buildCard(c: Character, entries: WorldInfoEntry[] = [], book?: Lorebook) {
  const was = cardData(c.rawCard)
  const data = {
    name: c.name,
    description: c.description,
    personality: c.personality,
    scenario: c.scenario,
    first_mes: c.firstMessage,
    mes_example: c.exampleDialogue,
    creator_notes: c.creatorNotes,
    system_prompt: c.systemPrompt,
    post_history_instructions: c.postHistoryInstructions,
    alternate_greetings: c.alternateGreetings,
    tags: c.tags,
    creator: c.creator,
    character_version: c.characterVersion,
    character_book: buildBook(c, entries, book),
    extensions: {
      ...obj(was.extensions),
      alternate_fields: { ...obj(obj(was.extensions).alternate_fields), alt_descriptions: c.altDescriptions },
      nessu: {
        displayName: c.displayName ?? '',
        activeDescriptionIndex: c.activeDescriptionIndex,
        greetingTitles: c.greetingTitles ?? [],
        colors: c.colors,
        gallery: c.gallery,
        avatarCrop: c.avatarCrop,
        paramOverrides: c.paramOverrides,
        trackers: c.trackers ?? [],
        trackerCss: c.trackerCss ?? '',
        trackerFont: c.trackerFont ?? '',
      },
    },
  }
  // Top-level copies are what v1/v2-era readers actually look at.
  return { spec: 'chara_card_v3', spec_version: '3.0', ...data, data }
}

const fileName = (name: string) =>
  name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'character'

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export function exportCardJson(c: Character, entries: WorldInfoEntry[] = [], book?: Lorebook) {
  download(
    new Blob([JSON.stringify(buildCard(c, entries, book), null, 2)], { type: 'application/json' }),
    `${fileName(c.name)}.json`,
  )
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** Rebuilds `bytes` with a tEXt chunk per entry, dropping any existing chunk with those keywords. */
export function withTextChunks(bytes: Uint8Array, entries: [string, string][]): Uint8Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const keys = entries.map(([k]) => k)
  const parts: Uint8Array[] = [bytes.subarray(0, 8)] // PNG signature
  let i = 8
  while (i + 8 <= bytes.length) {
    const len = dv.getUint32(i)
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7])
    const whole = bytes.subarray(i, i + 12 + len)
    if (type === 'IEND') {
      for (const [k, v] of entries) {
        const head = k + '\0'
        const data = new Uint8Array(head.length + v.length)
        for (let j = 0; j < head.length; j++) data[j] = head.charCodeAt(j)
        for (let j = 0; j < v.length; j++) data[head.length + j] = v.charCodeAt(j)
        parts.push(chunk('tEXt', data))
      }
      parts.push(whole)
      break
    }
    let dropped = false
    if (type === 'tEXt') {
      const data = bytes.subarray(i + 8, i + 8 + len)
      const nul = data.indexOf(0)
      if (nul !== -1) dropped = keys.includes(String.fromCharCode(...data.subarray(0, nul)))
    }
    if (!dropped) parts.push(whole)
    i += 12 + len
  }
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

const toBase64 = (s: string) => btoa(unescape(encodeURIComponent(s))) // UTF-8 → latin1 → base64

/** Re-encodes the avatar as PNG bytes. Cross-origin URLs that block canvas reads throw. */
async function avatarPngBytes(avatar: string): Promise<Uint8Array> {
  if (avatar.startsWith('data:image/png')) {
    const buf = await (await fetch(avatar)).arrayBuffer()
    return new Uint8Array(buf)
  }
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Could not load the avatar image.'))
    img.src = avatar
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  canvas.getContext('2d')!.drawImage(img, 0, 0)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('Could not read the avatar image.')
  return new Uint8Array(await blob.arrayBuffer())
}

/** Card JSON embedded in the avatar PNG. Throws with a message meant for the user. */
export async function exportCardPng(c: Character, entries: WorldInfoEntry[] = [], book?: Lorebook) {
  if (!c.avatar) throw new Error('This character has no avatar image.')
  const b64 = toBase64(JSON.stringify(buildCard(c, entries, book)))
  // exports the uncropped original. Bake the crop in if someone asks.
  const png = withTextChunks(await avatarPngBytes(c.avatar), [
    ['chara', b64],
    ['ccv3', b64],
  ])
  download(new Blob([png.buffer as ArrayBuffer], { type: 'image/png' }), `${fileName(c.name)}.png`)
}
