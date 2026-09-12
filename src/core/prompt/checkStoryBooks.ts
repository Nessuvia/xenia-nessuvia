// Run: node --experimental-strip-types src/core/prompt/checkStoryBooks.ts
import assert from 'node:assert'
import type { Character, Lorebook, Story } from '../storage/types'
import { attachBook, enabledBookIds, removeBook, storyBooks, toggleBook } from './storyBooks.ts'

const book = (id: number, name: string, global = false): Lorebook =>
  ({ id, ownerId: 'local', name, description: '', global }) as Lorebook

const character = (id: number, name: string, lorebookIds?: number[]): Character =>
  ({ id, ownerId: 'local', name, lorebookIds }) as unknown as Character

const story = (patch: Partial<Story> = {}): Story =>
  ({ id: 1, ownerId: 'local', title: 't', cast: [], ...patch }) as Story

const books = [book(1, 'Global', true), book(2, "Mark's"), book(3, 'Loose'), book(4, "Dom's")]
const cast = [character(10, 'Mark', [2]), character(11, 'Dom', [4])]

// --- origins, order, and dedupe ---------------------------------------------
{
  const rows = storyBooks(
    story({
      cast: [
        { kind: 'character', id: 10, enabled: true },
        { kind: 'character', id: 11, enabled: true },
      ],
      lorebookIds: [3],
    }),
    cast,
    books,
  )
  assert.deepStrictEqual(
    rows.map((r) => [r.book.id, r.origin, r.from]),
    [
      [1, 'global', ''],
      [2, 'cast', 'Mark'],
      [4, 'cast', 'Dom'],
      [3, 'story', ''],
    ],
  )
  assert.deepStrictEqual(enabledBookIds(rows), [1, 2, 4, 3])
}

// A disabled cast member takes their book with them: they contribute nothing else either.
{
  const rows = storyBooks(
    story({ cast: [{ kind: 'character', id: 10, enabled: false }] }),
    cast,
    books,
  )
  assert.deepStrictEqual(rows.map((r) => r.book.id), [1])
}

// A persona in the cast carries no books, and a deleted character is skipped rather than throwing.
{
  const rows = storyBooks(
    story({
      cast: [
        { kind: 'persona', id: 10, enabled: true },
        { kind: 'character', id: 99, enabled: true },
      ],
    }),
    cast,
    books,
  )
  assert.deepStrictEqual(rows.map((r) => r.book.id), [1])
}

// The same book from two characters is listed once, under the first that brought it.
{
  const shared = [character(10, 'Mark', [2]), character(11, 'Dom', [2])]
  const rows = storyBooks(
    story({
      cast: [
        { kind: 'character', id: 10, enabled: true },
        { kind: 'character', id: 11, enabled: true },
      ],
    }),
    shared,
    books,
  )
  assert.deepStrictEqual(rows.filter((r) => r.book.id === 2).map((r) => r.from), ['Mark'])
}

// An id with no book behind it (deleted out from under the Story) is skipped.
{
  const rows = storyBooks(story({ lorebookIds: [3, 404] }), cast, books)
  assert.deepStrictEqual(rows.map((r) => r.book.id), [1, 3])
}

// --- off: listed, greyed, and out of the prompt ------------------------------
{
  const s = story({ cast: [{ kind: 'character', id: 10, enabled: true }], lorebookOff: [2] })
  const rows = storyBooks(s, cast, books)
  assert.deepStrictEqual(rows.map((r) => [r.book.id, r.enabled]), [
    [1, true],
    [2, false],
  ])
  assert.deepStrictEqual(enabledBookIds(rows), [1])

  // Toggling back on empties the list rather than leaving a dead id in it.
  assert.deepStrictEqual(toggleBook(s, 2), { lorebookOff: [] })
  assert.deepStrictEqual(toggleBook(story(), 2), { lorebookOff: [2] })
}

// --- remove: derived rows are dropped, attached ones are detached ------------
{
  const s = story({ cast: [{ kind: 'character', id: 10, enabled: true }], lorebookIds: [3] })
  const rows = storyBooks(s, cast, books)
  const castRow = rows.find((r) => r.origin === 'cast')!
  const own = rows.find((r) => r.origin === 'story')!
  const globalRow = rows.find((r) => r.origin === 'global')!

  assert.deepStrictEqual(removeBook(s, castRow), { lorebookDropped: [2] })
  assert.deepStrictEqual(removeBook(s, globalRow), { lorebookDropped: [1] })
  assert.deepStrictEqual(removeBook(s, own), { lorebookIds: [] })

  // A dropped cast book stays gone while the character is still in the cast.
  const after = { ...s, ...removeBook(s, castRow) }
  assert.deepStrictEqual(storyBooks(after, cast, books).map((r) => r.book.id), [1, 3])
}

// --- attach: re-adding a dropped book clears the drop ------------------------
{
  const s = story({ cast: [{ kind: 'character', id: 10, enabled: true }], lorebookDropped: [2] })
  assert.deepStrictEqual(attachBook(s, 2), { lorebookIds: [2], lorebookDropped: [] })
  const after = { ...s, ...attachBook(s, 2) } as Story
  // Back on the list, and once: it is the cast's copy that resurfaces, in cast position.
  assert.deepStrictEqual(storyBooks(after, cast, books).map((r) => [r.book.id, r.origin]), [
    [1, 'global'],
    [2, 'cast'],
  ])
}

// Attaching twice is idempotent.
{
  const s = story({ lorebookIds: [3] })
  assert.deepStrictEqual(attachBook(s, 3).lorebookIds, [3])
}

console.log('checkStoryBooks ok')
