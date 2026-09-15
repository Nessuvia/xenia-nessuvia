// Type-only imports on purpose: checkImportCard.ts runs this under `node --experimental-strip-types`,
// which can't resolve extensionless app imports (or boot Dexie).
import type {
  AvatarCrop,
  Character,
  CharacterColors,
  ParamOverrides,
} from '../../core/storage/types'
// Explicit extension: this file runs under node in checkImportCard.ts. The entry mapper is shared
// with the standalone-file import so the two paths can never read the same book differently.
import { mapBook, type ImportedBook } from '../lorebooks/importLorebook.ts'
import { readTrackers } from '../../core/trackers/trackerState.ts'
import { isFontId, trackerCssProblem } from '../../core/trackers/trackerCss.ts'

type Loose = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])

/**
 * Our own half of `extensions`, written by buildCard(). Every field is validated rather than
 * trusted: a card is untrusted input even when it claims to be one of ours.
 */
function readNessu(ext: Loose) {
  const n = (ext.nessu as Loose) ?? {}
  const colors = (n.colors as Loose) ?? {}
  const crop = (n.avatarCrop as Loose) ?? {}
  const cropped =
    num(crop.x) !== undefined && num(crop.y) !== undefined && num(crop.w) !== undefined && num(crop.h) !== undefined
  return {
    displayName: str(n.displayName),
    // Only the four known keys, and only strings: a color goes straight into a CSS var.
    colors: {
      textColor: str(colors.textColor),
      emphasisColor: str(colors.emphasisColor),
      boldColor: str(colors.boldColor),
      quoteColor: str(colors.quoteColor),
    } as CharacterColors,
    gallery: strList(n.gallery),
    greetingTitles: strList(n.greetingTitles),
    avatarCrop: cropped ? ({ x: crop.x, y: crop.y, w: crop.w, h: crop.h } as AvatarCrop) : undefined,
    paramOverrides: n.paramOverrides && typeof n.paramOverrides === 'object' ? (n.paramOverrides as ParamOverrides) : undefined,
    // -1 is the default meaning "description is already the active variant", so an absent value
    // lands there on its own.
    activeDescriptionIndex: num(n.activeDescriptionIndex) ?? -1,
    trackers: readTrackers(n.trackers),
    // Unsafe CSS drops at import. The renderer checks again for CSS typed in the editor.
    trackerCss: str(n.trackerCss) && !trackerCssProblem(str(n.trackerCss)) ? str(n.trackerCss) : undefined,
    trackerFont: isFontId(str(n.trackerFont)) ? str(n.trackerFont) : undefined,
  }
}

/** Maps a parsed v3/v2/bare character card onto a Character. Timestamps come from the store. */
export function importCard(json: unknown): Character {
  const card = (json ?? {}) as Loose
  const d = ((card.data as Loose) ?? card) as Loose

  const name = str(d.name).trim()
  if (!name) throw new Error('Not a character card: no name')

  const extensions = (d.extensions as Loose) ?? {}
  const altFields = (extensions.alternate_fields as Loose) ?? {}
  const rawAlts = altFields.alt_descriptions
  const altDescriptions = (Array.isArray(rawAlts) ? rawAlts : [])
    .filter(
      (a): a is { title: string; content: string } =>
        !!a && typeof (a as Loose).title === 'string' && typeof (a as Loose).content === 'string',
    )
    .map((a) => ({ title: a.title, content: a.content }))

  // Our own export round-trips through here: displayName, colors, gallery, crop and param
  // overrides come back off `extensions.nessu`, and default to empty on anyone else's card.
  const nessu = readNessu(extensions)

  return {
    ownerId: 'local', // storage.put() stamps this anyway; here only to satisfy the type
    createdAt: 0,
    updatedAt: 0,
    ...nessu,
    avatar: '',
    name,
    // avatar stays '': `'none'` and filename strings aren't images, and JSON cards embed none.
    description: str(d.description),
    personality: str(d.personality),
    scenario: str(d.scenario),
    firstMessage: str(d.first_mes),
    exampleDialogue: str(d.mes_example),
    altDescriptions,
    systemPrompt: str(d.system_prompt),
    postHistoryInstructions: str(d.post_history_instructions),
    creatorNotes: str(d.creator_notes),
    creator: str(d.creator),
    characterVersion: str(d.character_version),
    alternateGreetings: strList(d.alternate_greetings),
    // Verbatim: no case folding, no dedupe, no cap. Card sites emit junk, and the review screen on
    // import plus the Tags page are where that gets sorted out, not here.
    tags: strList(d.tags),
    rawCard: json,
    // The book itself is a record of its own now. charactersStore writes it and links the id, so
    // nothing about it lands on the Character here.
  }
}

/** The `data` object of a card, or the card itself for a bare v1 one. */
export const cardData = (json: unknown): Loose => {
  const card = (json ?? {}) as Loose
  return ((card.data as Loose) ?? card) as Loose
}

export const bookOf = (json: unknown): Loose | undefined => {
  const card = (json ?? {}) as Loose
  const d = ((card.data as Loose) ?? card) as Loose
  return (d.character_book ?? card.character_book) as Loose | undefined
}

/**
 * A card's `character_book`, mapped through the same reader a standalone world-info file uses.
 * Both halves come back together because a card has one book: `book` becomes a Lorebook record,
 * `entries` go in the worldInfo table keyed to it.
 *
 * The card's own name is the book's fallback label: a `character_book` with no `name` is the
 * common case, and "Ada" reads better in the Lorebooks list than "Lorebook".
 */
export function importBook(json: unknown): ImportedBook {
  return mapBook(bookOf(json), str(cardData(json).name).trim() || 'Lorebook')
}
