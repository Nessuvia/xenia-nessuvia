import assert from 'node:assert'
import type { Note } from '../storage/types.ts'
import { manuscript, moveNote, stepMove, visibleRows } from './noteTree.ts'

const note = (id: number, parentId: number | null, sortOrder: number, inManuscript = true): Note => ({
  id, ownerId: 'local', parentId, sortOrder, title: `n${id}`, text: '', status: 'draft', synopsis: '',
  inManuscript, createdAt: 0, updatedAt: 0,
})

// 1 ─ 2 ─ 4
//   └ 3 (excluded) ─ 5
// 6
const notes = [note(1, null, 0), note(2, 1, 0), note(3, 1, 1, false), note(4, 2, 0), note(5, 3, 0), note(6, null, 1)]
const ids = (rows: { note: Note }[]) => rows.map((r) => r.note.id)

// Manuscript: depth first, an excluded note drops its subtree, the root always shows.
assert.deepEqual(ids(manuscript(notes, 1)), [1, 2, 4])
assert.deepEqual(ids(manuscript(notes, 3)), [3, 5])

// Visible rows descend only into expanded notes.
assert.deepEqual(ids(visibleRows(notes, new Set())), [1, 6])
assert.deepEqual(ids(visibleRows(notes, new Set([1, 2]))), [1, 2, 4, 3, 6])

// Cycle guard: not onto itself, not into its own subtree.
assert.equal(moveNote(notes, 1, 1, 'into'), null)
assert.equal(moveNote(notes, 1, 4, 'into'), null)
assert.equal(moveNote(notes, 1, 4, 'after'), null)

// Reparent: 6 into 2 lands after 4.
assert.deepEqual(moveNote(notes, 6, 2, 'into')!.map((n) => [n.id, n.parentId, n.sortOrder]), [[6, 2, 1]])
// Reorder: 3 before 2 renumbers both.
assert.deepEqual(moveNote(notes, 3, 2, 'before')!.map((n) => [n.id, n.sortOrder]), [[3, 0], [2, 1]])

// Steps.
assert.equal(stepMove(notes, 2, 'up'), null)
assert.deepEqual(stepMove(notes, 3, 'indent')!.map((n) => [n.id, n.parentId]), [[3, 2]])
assert.deepEqual(stepMove(notes, 4, 'outdent')!.map((n) => [n.id, n.parentId, n.sortOrder]), [[4, 1, 1], [3, 1, 2]])
assert.equal(stepMove(notes, 6, 'outdent'), null)
