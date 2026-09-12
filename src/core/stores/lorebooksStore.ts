import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { Lorebook } from '../storage/types'
// core reaching into a module, the same way charactersStore reaches for the card parser: the
// file readers live with the UI that offers them. Move them into core if a second core caller wants
// them.
import { importLorebook, type ImportedBook } from '../../modules/lorebooks/importLorebook'
import { useWorldInfo } from './worldInfoStore'

export function newBook(name = ''): Lorebook {
  return { ownerId: currentOwnerId(), name, description: '', global: false }
}

/**
 * Strip a deleted book's id from every character and chat holding it. Written through `storage`
 * rather than through the two stores: this file doesn't import them back. `charactersStore`
 * already imports this one. The stores' in-memory rows reload on their next `load()`, and
 * `BookAttach` drops a stale id it can't resolve on sight.
 */
async function detachEverywhere(bookId: number) {
  for (const table of ['characters', 'chats'] as const) {
    for (const row of await storage.getAll(table)) {
      const ids = row.lorebookIds as number[] | undefined
      if (!ids?.includes(bookId)) continue
      await storage.put(table, { ...row, lorebookIds: ids.filter((id) => id !== bookId) })
    }
  }
}

const byName = (a: Lorebook, b: Lorebook) =>
  a.name.localeCompare(b.name) || (a.id ?? 0) - (b.id ?? 0)

interface LorebooksState {
  books: Lorebook[]
  /** Entries per book id, for the list. Counted on load rather than held per book: the number is a
   *  property of the worldInfo table, and a stale copy on the book row is the thing that rots. */
  counts: Record<number, number>
  /** Character names holding each book id, for the Bundled group in the list. Read here for the
   *  same reason `counts` is: attachment lives on the character row, and the view must not reach
   *  into storage itself. A book attached to a chat is not bundled, only characters travel with
   *  a card. */
  bundledTo: Record<number, string[]>
  loading: boolean
  load(): Promise<void>
  save(book: Lorebook): Promise<number>
  /** Writes a book and its entries together. The one path an import takes, so a book row can never
   *  land without the entries that make it worth having. */
  create(imported: ImportedBook): Promise<number>
  /** Reads a `.json` world-info export, a `character_book` wrapper, or a whole card. */
  importFile(text: string, fallbackName?: string): Promise<number>
  remove(id: number): Promise<void>
}

export const useLorebooks = create<LorebooksState>()((set, get) => ({
  books: [],
  counts: {},
  bundledTo: {},
  loading: false,

  load: async () => {
    set({ loading: true })
    const rows = (await storage.getAll('lorebooks')) as unknown as Lorebook[]
    const counts: Record<number, number> = {}
    for (const entry of await storage.getAll('worldInfo')) {
      const bookId = entry.bookId as number
      counts[bookId] = (counts[bookId] ?? 0) + 1
    }
    const bundledTo: Record<number, string[]> = {}
    for (const row of await storage.getAll('characters')) {
      const ids = row.lorebookIds as number[] | undefined
      if (!ids?.length) continue
      const name = (row.name as string) || 'Unnamed'
      for (const id of ids) (bundledTo[id] ??= []).push(name)
    }
    set({ books: rows.sort(byName), counts, bundledTo, loading: false })
  },

  save: async (book) => {
    const id = await storage.put('lorebooks', book as unknown as StoredRecord)
    await get().load()
    return id
  },

  create: async ({ book, entries }) => {
    const id = await storage.put(
      'lorebooks',
      { ...book, ownerId: currentOwnerId() } as unknown as StoredRecord,
    )
    if (entries.length) await useWorldInfo.getState().addAll(id, entries)
    await get().load()
    return id
  },

  importFile: async (text, fallbackName) => {
    return get().create(importLorebook(JSON.parse(text), fallbackName))
  },

  remove: async (id) => {
    // Cascade: an entry with no book is unreachable and unmatchable. It goes with it, and the
    // attachments go too. A dead id used to sit on the character, resolving to no row but still
    // counting: the tab read "1 lorebook" over an empty list, and the next attach made 2.
    await useWorldInfo.getState().removeFor(id)
    await storage.remove('lorebooks', id)
    await detachEverywhere(id)
    await get().load()
  },
}))

/** Every book id in play for a turn: global books, plus the speaker's, plus the chat's. Deduped,
 *  and in that order so a global book's entries sort ahead of an attachment's at equal `order`. */
export function bookIdsFor(
  books: Lorebook[],
  characterIds?: number[],
  chatIds?: number[],
): number[] {
  const ids = [
    ...books.filter((b) => b.global).map((b) => b.id!),
    ...(characterIds ?? []),
    ...(chatIds ?? []),
  ]
  return [...new Set(ids.filter((id) => typeof id === 'number'))]
}
