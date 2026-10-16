// `[[Note title]]` links between notes. Pure. A link is its title, matched exactly, and resolves to
// the first note with that title in tree order. Titles aren't forced unique.
//
// Extension-ful imports on purpose: checkNoteLinks.ts runs this under node --experimental-strip-types.
import type { Note } from '../storage/types.ts'
import { treeOrder } from './noteTree.ts'

const linkPattern = /\[\[([^[\]\n]+)\]\]/g

/** Every link in `text`, with its offsets. `from`/`to` cover the brackets. */
export function findLinks(text: string): { from: number; to: number; title: string }[] {
  return [...text.matchAll(linkPattern)].map((m) => ({ from: m.index, to: m.index + m[0].length, title: m[1] }))
}

export function resolveTitle(notes: Note[], title: string): Note | undefined {
  return treeOrder(notes).find((n) => n.title === title)
}

/** Notes linking to `note`: their links say its title and the title resolves to it. */
export function backlinks(notes: Note[], note: Note): Note[] {
  if (resolveTitle(notes, note.title)?.id !== note.id) return []
  return treeOrder(notes).filter((n) => n.id !== note.id && findLinks(n.text).some((l) => l.title === note.title))
}

/**
 * The rows to write when `id` is renamed: every note whose text links to the old title, rewritten
 * to the new one. Empty when the old title resolves elsewhere: those links were never this note's.
 */
export function renameLinks(notes: Note[], id: number, oldTitle: string, newTitle: string): Note[] {
  if (!oldTitle || oldTitle === newTitle || resolveTitle(notes, oldTitle)?.id !== id) return []
  const from = `[[${oldTitle}]]`
  return notes
    .filter((n) => n.text.includes(from))
    .map((n) => ({ ...n, text: n.text.split(from).join(`[[${newTitle}]]`) }))
}
