// The Notes tree: order, visible rows, manuscripts and moves. Pure. Every function takes the whole
// list: a writer's notebook is hundreds of rows, not thousands.
//
// ponytail: childrenOf filters the full list per call, so a walk is O(n²). Build a parent map once
// per walk if a notebook ever gets big enough to feel it.
//
// Extension-ful imports on purpose: checkNoteTree.ts runs this under node --experimental-strip-types.
import type { Note } from '../storage/types.ts'

export type DropWhere = 'before' | 'after' | 'into'
export type Step = 'up' | 'down' | 'indent' | 'outdent'

const bySort = (a: Note, b: Note) => a.sortOrder - b.sortOrder || (a.id ?? 0) - (b.id ?? 0)

/** A note's children in order. `null` is the top level. */
export function childrenOf(notes: Note[], parentId: number | null): Note[] {
  return notes.filter((n) => n.parentId === parentId).sort(bySort)
}

/** The sortOrder a new last child of `parentId` takes. */
export function nextSortOrder(notes: Note[], parentId: number | null): number {
  return Math.max(-1, ...childrenOf(notes, parentId).map((n) => n.sortOrder)) + 1
}

/** Every note reachable from the top, depth first. */
export function treeOrder(notes: Note[]): Note[] {
  const out: Note[] = []
  const walk = (parentId: number | null) => {
    for (const n of childrenOf(notes, parentId)) {
      out.push(n)
      walk(n.id!)
    }
  }
  walk(null)
  return out
}

export interface TreeRow {
  note: Note
  depth: number
  hasChildren: boolean
}

/** The rows the sidebar shows: depth first, descending only into expanded notes. */
export function visibleRows(notes: Note[], expanded: Set<number>): TreeRow[] {
  const out: TreeRow[] = []
  const walk = (parentId: number | null, depth: number) => {
    for (const note of childrenOf(notes, parentId)) {
      const hasChildren = notes.some((n) => n.parentId === note.id)
      out.push({ note, depth, hasChildren })
      if (hasChildren && expanded.has(note.id!)) walk(note.id!, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

/** The ancestors of a note, nearest first. Stops on a loop rather than spinning. */
export function ancestorIds(notes: Note[], id: number): number[] {
  const out: number[] = []
  let parentId = notes.find((n) => n.id === id)?.parentId ?? null
  while (parentId !== null && !out.includes(parentId)) {
    out.push(parentId)
    parentId = notes.find((n) => n.id === parentId)?.parentId ?? null
  }
  return out
}

/** A note and everything under it. */
export function subtreeIds(notes: Note[], id: number): number[] {
  return [id, ...childrenOf(notes, id).flatMap((n) => subtreeIds(notes, n.id!))]
}

/**
 * A manuscript: the root note, then its included descendants depth first. An excluded note takes
 * its subtree out with it. The root itself is always there: opening one is asking for it.
 */
export function manuscript(notes: Note[], rootId: number): { note: Note; depth: number }[] {
  const root = notes.find((n) => n.id === rootId)
  if (!root) return []
  const out = [{ note: root, depth: 0 }]
  const walk = (parentId: number, depth: number) => {
    for (const note of childrenOf(notes, parentId)) {
      if (!note.inManuscript) continue
      out.push({ note, depth })
      walk(note.id!, depth + 1)
    }
  }
  walk(rootId, 1)
  return out
}

/**
 * Move a note before, after or into another. Returns the rows whose parent or order changed, ready
 * to write, or null when the move is refused: onto itself or into its own subtree.
 */
export function moveNote(notes: Note[], id: number, targetId: number, where: DropWhere): Note[] | null {
  const note = notes.find((n) => n.id === id)
  const target = notes.find((n) => n.id === targetId)
  if (!note || !target || targetId === id || ancestorIds(notes, targetId).includes(id)) return null
  const parentId = where === 'into' ? targetId : target.parentId
  const siblings = childrenOf(notes, parentId).filter((n) => n.id !== id)
  const at =
    where === 'into' ? siblings.length : siblings.findIndex((n) => n.id === targetId) + (where === 'after' ? 1 : 0)
  siblings.splice(at, 0, note)
  return siblings
    .map((n, i) => ({ ...n, parentId, sortOrder: i }))
    .filter((n, i) => n.sortOrder !== siblings[i].sortOrder || n.parentId !== siblings[i].parentId)
}

/** The row menu's moves, for when dragging isn't practical. Null when there's nowhere to go. */
export function stepMove(notes: Note[], id: number, step: Step): Note[] | null {
  const note = notes.find((n) => n.id === id)
  if (!note) return null
  const siblings = childrenOf(notes, note.parentId)
  const i = siblings.findIndex((n) => n.id === id)
  if (step === 'up') return i > 0 ? moveNote(notes, id, siblings[i - 1].id!, 'before') : null
  if (step === 'down') return i < siblings.length - 1 ? moveNote(notes, id, siblings[i + 1].id!, 'after') : null
  if (step === 'indent') return i > 0 ? moveNote(notes, id, siblings[i - 1].id!, 'into') : null
  return note.parentId !== null ? moveNote(notes, id, note.parentId, 'after') : null
}
