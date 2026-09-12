import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { WorldInfoEntry } from '../storage/types'
import type { ImportedEntry } from '../../modules/lorebooks/importLorebook'

/** A blank hand-authored entry. Ordered after everything imported so it lands at the bottom. */
export function newEntry(bookId: number, order: number): WorldInfoEntry {
  return {
    ownerId: currentOwnerId(),
    bookId,
    name: '',
    keys: [],
    secondaryKeys: [],
    selectiveLogic: 0,
    content: '',
    always: false,
    enabled: true,
    order,
    position: 'beforeChar',
  }
}

const byOrder = (a: WorldInfoEntry, b: WorldInfoEntry) =>
  a.order - b.order || (a.id ?? 0) - (b.id ?? 0)

interface WorldInfoState {
  /** Entries for the book currently open in the editor, not the ones being sent for. */
  entries: WorldInfoEntry[]
  bookId: number | null
  loadFor(bookId: number): Promise<void>
  save(entry: WorldInfoEntry): Promise<void>
  /** Move the loaded book's entry at `from` to `to`, renumbering `order` across the book. */
  reorder(from: number, to: number): Promise<void>
  remove(id: number): Promise<void>
  /** Import: writes a whole book's entries against a book that now has an id. */
  addAll(bookId: number, entries: ImportedEntry[]): Promise<void>
  /** Delete a book's entries, the lorebook cascade calls this. */
  removeFor(bookId: number): Promise<void>
  /** The send path. Reads storage without touching `entries`: the books in play for a turn
   *  are usually not the one open in the editor. */
  fetchFor(bookId: number): Promise<WorldInfoEntry[]>
  /** The send path, for the several books a turn can have attached. One pass, sorted as one list. */
  fetchForBooks(ids: number[]): Promise<WorldInfoEntry[]>
}

export const useWorldInfo = create<WorldInfoState>()((set, get) => ({
  entries: [],
  bookId: null,

  loadFor: async (bookId) => {
    const rows = await get().fetchFor(bookId)
    set({ entries: rows, bookId })
  },

  save: async (entry) => {
    await storage.put('worldInfo', entry as unknown as StoredRecord)
    if (get().bookId === entry.bookId) await get().loadFor(entry.bookId)
  },

  reorder: async (from, to) => {
    const bookId = get().bookId
    if (bookId === null) return
    const list = [...get().entries]
    const [moved] = list.splice(from, 1)
    if (!moved) return
    list.splice(to, 0, moved)
    // Renumbered in hundreds, whole book at a time. Gaps leave room to type an order between two
    // rows later without rewriting the book, and the numbers stay meaningful across books, the
    // send path sorts every attached book's entries as one list by `order`.
    for (const [i, entry] of list.entries()) {
      const order = (i + 1) * 100
      if (entry.order === order) continue
      await storage.put('worldInfo', { ...entry, order } as unknown as StoredRecord)
    }
    await get().loadFor(bookId)
  },

  remove: async (id) => {
    const bookId = get().bookId
    await storage.remove('worldInfo', id)
    if (bookId !== null) await get().loadFor(bookId)
  },

  addAll: async (bookId, entries) => {
    for (const entry of entries) {
      await storage.put('worldInfo', {
        ...entry,
        ownerId: currentOwnerId(),
        bookId,
      } as unknown as StoredRecord)
    }
    if (get().bookId === bookId) await get().loadFor(bookId)
  },

  removeFor: async (bookId) => {
    for (const row of await storage.find('worldInfo', 'bookId', bookId)) {
      await storage.remove('worldInfo', row.id!)
    }
  },

  fetchFor: async (bookId) => {
    const rows = (await storage.find(
      'worldInfo',
      'bookId',
      bookId,
    )) as unknown as WorldInfoEntry[]
    return rows.sort(byOrder)
  },

  fetchForBooks: async (ids) => {
    const lists = await Promise.all(ids.map((id) => get().fetchFor(id)))
    // Sorted as one list: `order` is what a book means by priority, and two books' entries
    // interleave by it rather than one book's whole run coming before the other's.
    return lists.flat().sort(byOrder)
  },
}))
