import assert from 'node:assert'
import type { Note } from '../storage/types.ts'
import { backlinks, findLinks, renameLinks } from './noteLinks.ts'

const note = (id: number, sortOrder: number, title: string, text = ''): Note => ({
  id, ownerId: 'local', parentId: null, sortOrder, title, text, status: 'draft', synopsis: '',
  inManuscript: true, createdAt: 0, updatedAt: 0,
})

assert.deepEqual(findLinks('see [[Ann]] and [[ Bo ]], not [[]] or [x]'), [
  { from: 4, to: 11, title: 'Ann' },
  { from: 16, to: 24, title: ' Bo ' },
])

// Two notes titled Ann: links resolve to the first in tree order.
const notes = [note(1, 0, 'Ann'), note(2, 1, 'Ann'), note(3, 2, 'Scene', 'Then [[Ann]] left. [[Ann]]. [[Annie]]')]
assert.deepEqual(backlinks(notes, notes[0]).map((n) => n.id), [3])
assert.deepEqual(backlinks(notes, notes[1]), [])

// Rename rewrites exact links only, and only for the note the title resolves to.
assert.equal(renameLinks(notes, 1, 'Ann', 'Anne')[0].text, 'Then [[Anne]] left. [[Anne]]. [[Annie]]')
assert.deepEqual(renameLinks(notes, 2, 'Ann', 'Anne'), [])
assert.deepEqual(renameLinks(notes, 1, 'Ann', 'Ann'), [])
