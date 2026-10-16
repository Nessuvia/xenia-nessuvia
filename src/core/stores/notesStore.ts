import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId, type StoredRecord } from '../storage/storageInterface'
import type { Note } from '../storage/types'
import { nextSortOrder, subtreeIds } from '../notes/noteTree'
import { renameLinks } from '../notes/noteLinks'

export function newNote(parentId: number | null, sortOrder: number, title = ''): Note {
  const now = Date.now()
  return {
    ownerId: currentOwnerId(),
    parentId,
    sortOrder,
    title,
    text: '',
    status: 'draft',
    synopsis: '',
    inManuscript: true,
    createdAt: now,
    updatedAt: now,
  }
}

const put = (note: Note) => storage.put('notes', note as unknown as StoredRecord)

interface NotesState {
  notes: Note[]
  loaded: boolean
  load(): Promise<void>
  create(parentId: number | null, title?: string): Promise<number>
  /** Status, synopsis, the manuscript checkbox. Not the title or the text: those have their own. */
  update(note: Note): Promise<void>
  /** The editor's debounced save. */
  saveText(id: number, text: string): Promise<void>
  /** Renames, and with `rewriteLinks` rewrites `[[old]]` to `[[new]]` in every note. */
  rename(id: number, title: string, rewriteLinks: boolean): Promise<void>
  /** Writes the rows a move changed (`moveNote`, `stepMove`). */
  move(rows: Note[]): Promise<void>
  /** Deletes a note and everything under it. */
  remove(id: number): Promise<void>
}

export const useNotes = create<NotesState>()((set, get) => {
  // State before storage, as in palettesStore.update: a field bound to a value that waits on
  // Dexie gets its own keystroke back a tick late, and React puts the caret at the end.
  const replace = (rows: Note[]) => {
    const byId = new Map(rows.map((n) => [n.id, n]))
    set({ notes: get().notes.map((n) => byId.get(n.id) ?? n) })
    return Promise.all(rows.map(put))
  }

  return {
    notes: [],
    loaded: false,

    load: async () => {
      const notes = (await storage.getAll('notes')) as unknown as Note[]
      set({ notes, loaded: true })
    },

    create: async (parentId, title = '') => {
      const note = newNote(parentId, nextSortOrder(get().notes, parentId), title)
      const id = await put(note)
      set({ notes: [...get().notes, { ...note, id }] })
      return id
    },

    update: async (note) => {
      await replace([{ ...note, updatedAt: Date.now() }])
    },

    saveText: async (id, text) => {
      const note = get().notes.find((n) => n.id === id)
      if (!note || note.text === text) return
      await replace([{ ...note, text, updatedAt: Date.now() }])
    },

    rename: async (id, title, rewriteLinks) => {
      const notes = get().notes
      const note = notes.find((n) => n.id === id)
      if (!note || note.title === title) return
      // ponytail: the renamed note's own text is skipped. It's open in the editor, which would save
      // its old copy back over the rewrite. A note linking to itself keeps the old title.
      const linked = rewriteLinks ? renameLinks(notes, id, note.title, title).filter((n) => n.id !== id) : []
      await replace([{ ...note, title, updatedAt: Date.now() }, ...linked])
    },

    move: async (rows) => {
      await replace(rows)
    },

    remove: async (id) => {
      const ids = new Set(subtreeIds(get().notes, id))
      set({ notes: get().notes.filter((n) => !ids.has(n.id!)) })
      for (const noteId of ids) await storage.remove('notes', noteId)
    },
  }
})
