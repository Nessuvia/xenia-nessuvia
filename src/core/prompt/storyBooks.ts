// Extension-ful imports on purpose: checkStoryBooks.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { Character, Lorebook, Story } from '../storage/types'

/** Where a book in a Story's list came from. `story` is the only removable-by-detaching kind: the
 *  other two are derived, and removing one writes to `lorebookDropped` instead. */
export type BookOrigin = 'global' | 'cast' | 'story'

/** One row of the Story's Lorebooks list. */
export interface StoryBook {
  book: Lorebook
  origin: BookOrigin
  /** The cast character carrying it, on a `cast` row. Empty otherwise. */
  from: string
  enabled: boolean
}

/**
 * The books in play for a Story, in prompt order: every global book, then the enabled cast's own,
 * then the ones attached to this Story. Deduped by id, first origin winning: a global book that
 * a cast member also carries is listed once as global.
 *
 * A disabled cast member contributes nothing else to the prompt. Their book drops out with them
 * rather than outliving the character it describes.
 */
export function storyBooks(story: Story, characters: Character[], books: Lorebook[]): StoryBook[] {
  const dropped = new Set(story.lorebookDropped ?? [])
  const off = new Set(story.lorebookOff ?? [])
  const byId = new Map(books.filter((b) => typeof b.id === 'number').map((b) => [b.id!, b]))

  const rows: StoryBook[] = []
  const seen = new Set<number>()
  const add = (id: number, origin: BookOrigin, from: string) => {
    const book = byId.get(id)
    if (!book || seen.has(id)) return
    // A dropped id is still skipped here rather than filtered later: it can't take the slot of
    // a later origin that would otherwise have listed the same book.
    seen.add(id)
    if (dropped.has(id) && origin !== 'story') return
    rows.push({ book, origin, from, enabled: !off.has(id) })
  }

  for (const book of books) if (book.global) add(book.id!, 'global', '')
  for (const entry of story.cast) {
    if (!entry.enabled || entry.kind !== 'character') continue
    const character = characters.find((c) => c.id === entry.id)
    if (!character) continue
    for (const id of character.lorebookIds ?? []) add(id, 'cast', character.name)
  }
  for (const id of story.lorebookIds ?? []) add(id, 'story', '')
  return rows
}

/** The ids whose entries go into the prompt: the listed books that are switched on. */
export const enabledBookIds = (rows: StoryBook[]): number[] =>
  rows.filter((r) => r.enabled).map((r) => r.book.id!)

/**
 * The Story patch that removes one row. A book this Story attached itself is detached; anything
 * derived is recorded as dropped, which is what keeps it from coming back on the next render.
 */
export function removeBook(story: Story, row: StoryBook): Partial<Story> {
  const id = row.book.id!
  if (row.origin === 'story')
    return { lorebookIds: (story.lorebookIds ?? []).filter((x) => x !== id) }
  return { lorebookDropped: [...new Set([...(story.lorebookDropped ?? []), id])] }
}

/** The Story patch that flips one row on or off. */
export function toggleBook(story: Story, id: number): Partial<Story> {
  const off = story.lorebookOff ?? []
  return {
    lorebookOff: off.includes(id) ? off.filter((x) => x !== id) : [...off, id],
  }
}

/**
 * The Story patch that attaches a standalone book. Attaching a book the Story had dropped clears
 * the drop as well: the Author asking for it back outranks the older removal, and leaving it in
 * `lorebookDropped` would keep the cast's copy of the same book hidden.
 */
export function attachBook(story: Story, id: number): Partial<Story> {
  return {
    lorebookIds: [...new Set([...(story.lorebookIds ?? []), id])],
    lorebookDropped: (story.lorebookDropped ?? []).filter((x) => x !== id),
  }
}
