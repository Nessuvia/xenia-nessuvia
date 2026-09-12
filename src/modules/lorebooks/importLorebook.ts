// Type-only imports on purpose: checkImportLorebook.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports (or boot Dexie).
import type { EntryPosition, Lorebook, WorldInfoEntry } from '../../core/storage/types'

type Loose = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const keyList = (v: unknown) =>
  (Array.isArray(v) ? v : []).filter((k): k is string => typeof k === 'string' && !!k.trim())

/** An entry as it comes off a file: everything but the ids, which the store stamps on write. */
export type ImportedEntry = Omit<WorldInfoEntry, 'ownerId' | 'bookId'>

/** A book plus its entries, as read off a file. `book` has no id until the store writes it. */
export interface ImportedBook {
  book: Omit<Lorebook, 'id' | 'ownerId'>
  entries: ImportedEntry[]
}

/**
 * SillyTavern's `position` numbering, which is what both an export and a card's `character_book`
 * carry. 2 and 3 are before/after the author's note. This pass has no slot for that: they land
 * with the after-character entries rather than being dropped. The v2/v3 spec's string spelling is
 * accepted too. Cards in the wild write either.
 */
function readPosition(v: unknown): EntryPosition {
  if (typeof v === 'string') {
    if (v === 'after_char') return 'afterChar'
    if (v === 'at_depth') return 'atDepth'
    return 'beforeChar'
  }
  if (v === 4) return 'atDepth'
  // 1, 2 and 3. An entry that names no position at all lands in the block with the rest, which is
  // where every entry went before positions were read.
  if (v === 1 || v === 2 || v === 3) return 'afterChar'
  return 'beforeChar'
}

/**
 * One entry off a card's `character_book` or a standalone world-info export, mapped onto our
 * record. The single mapper both import paths call: an embedded book and a bare file can never
 * read the same file differently.
 *
 * Every field is read through two or three spellings because the format has no single writer: the
 * v2/v3 spec says `keys`/`secondary_keys`/`enabled`, SillyTavern writes `key`/`keysecondary`/
 * `disable`, and a file exported by a recent build carries both halves.
 */
export function mapEntry(item: unknown, index: number): ImportedEntry {
  const e = (item ?? {}) as Loose
  const keys = keyList(e.key ?? e.keys)
  const extensions = (e.extensions as Loose) ?? {}
  // Secondary keys only gate when the entry is actually selective. An explicit `selective: false`
  // means the author turned the gate off and left the keys behind.
  const selective = e.selective !== false
  return {
    // `comment` first: the spec's own `name` is routinely empty and the label lives there.
    name: str(e.comment).trim() || str(e.name).trim() || keys[0] || 'Entry',
    keys,
    secondaryKeys: selective ? keyList(e.keysecondary ?? e.secondary_keys) : [],
    selectiveLogic: num(e.selectiveLogic) ?? 0,
    caseSensitive: e.case_sensitive === true,
    content: str(e.content),
    always: e.constant === true,
    // Anything but an explicit off is on: an absent flag means the author never turned it off.
    // Both spellings are checked: SillyTavern writes `disable`, the spec writes `enabled`.
    enabled: e.enabled !== false && e.disable !== true,
    // `extensions.scan_depth`, NOT `extensions.depth`: the latter is where SillyTavern inserts
    // the entry in history, which has nothing to do with how far back keys are scanned.
    scanDepth: num(extensions.scan_depth),
    order: num(e.insertion_order) ?? num(e.order) ?? num(e.priority) ?? index,
    position: readPosition(e.position),
    depth: num(e.depth) ?? num(extensions.depth) ?? 4,
    raw: item,
  }
}

/**
 * The entry list off a book object. Files disagree about its shape: the v2/v3 spec says an array,
 * SillyTavern's own world-info export writes an object keyed by index. Both are accepted.
 */
export function entryList(raw: Loose | undefined): unknown[] {
  if (Array.isArray(raw?.entries)) return raw.entries
  if (raw?.entries && typeof raw.entries === 'object') return Object.values(raw.entries as Loose)
  return []
}

/** Book-level fields plus every entry that has something to inject. */
export function mapBook(raw: Loose | undefined, fallbackName: string): ImportedBook {
  return {
    book: {
      name: str(raw?.name).trim() || fallbackName,
      description: str(raw?.description),
      scanDepth: num(raw?.scan_depth),
      tokenBudget: num(raw?.token_budget),
      global: false,
    },
    // No content is nothing to inject, whatever the keys say.
    entries: entryList(raw).map(mapEntry).filter((e) => e.content.trim()),
  }
}

/**
 * A standalone world-info file. Accepts the bare `{name, entries}` object SillyTavern exports, a
 * `character_book` wrapper, and a whole character card with a book inside it: the three things a
 * user is likely to drop on the import button.
 *
 * `fallbackName` is the file's own name, used when the book carries none: an ST export often has
 * an empty `name` and the filename is the only label there is.
 */
export function importLorebook(json: unknown, fallbackName = 'Lorebook'): ImportedBook {
  const root = (json ?? {}) as Loose
  const data = ((root.data as Loose) ?? root) as Loose
  const wrapped = (data.character_book ?? root.character_book) as Loose | undefined
  const raw = wrapped ?? root
  if (!entryList(raw).length) throw new Error('No lorebook entries in this file.')
  return mapBook(raw, fallbackName)
}
