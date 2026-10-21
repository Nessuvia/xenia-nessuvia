import assert from 'node:assert/strict'
import { narratorBookIds } from './narratorBooks.ts'

assert.deepEqual(narratorBookIds([]), [], 'an empty roster borrows nothing')
assert.deepEqual(narratorBookIds([undefined, undefined]), [], 'cards with no books borrow nothing')
assert.deepEqual(narratorBookIds([[4, 2]]), [4, 2], 'a solo chat borrows that character, in order')

assert.deepEqual(
  narratorBookIds([[1, 2], [3]]),
  [1, 2, 3],
  'a group borrows every participant',
)

assert.deepEqual(
  narratorBookIds([[1, 2], [2, 3], [1]]),
  [1, 2, 3],
  'a book two characters share is borrowed once',
)

assert.deepEqual(
  narratorBookIds([[5, 5]]),
  [5],
  'a card listing the same book twice still contributes it once',
)

assert.deepEqual(
  narratorBookIds([undefined, [7], undefined, [6]]),
  [7, 6],
  'a card with no books is skipped without disturbing the order',
)

console.log('checkNarratorBooks: ok')
