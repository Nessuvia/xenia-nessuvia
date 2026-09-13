import assert from 'node:assert'
import { cutSpan, locate, occurrenceBefore, replaceSpan } from './selectionEdit.ts'

// Plain substring, first occurrence.
assert.deepEqual(locate('the cat sat', 'cat', 0), { start: 4, end: 7 })

// Repeats: the occurrence count picks which one.
const repeat = 'cat and cat and cat'
assert.deepEqual(locate(repeat, 'cat', 0), { start: 0, end: 3 })
assert.deepEqual(locate(repeat, 'cat', 1), { start: 8, end: 11 })
assert.deepEqual(locate(repeat, 'cat', 2), { start: 16, end: 19 })

// Counting occurrences in the rendered text, which is what feeds that index.
assert.equal(occurrenceBefore(repeat, 'cat', 0), 0)
assert.equal(occurrenceBefore(repeat, 'cat', 8), 1)
assert.equal(occurrenceBefore(repeat, 'cat', 16), 2)

// A selection that crossed a marker renderText dropped: rendered "the cat sat", stored has **.
assert.deepEqual(locate('the **cat** sat', 'cat sat', 0), { start: 6, end: 15 })
assert.deepEqual(locate('a *very* good dog', 'very good', 0), { start: 3, end: 13 })

// Nothing like it in the stored text: caller falls back to the whole-message edit.
assert.equal(locate('the cat sat', 'dog', 0), null)
assert.equal(locate('the cat sat', '', 0), null)

// A stale count still cuts the one unambiguous hit.
assert.deepEqual(locate('the cat sat', 'cat', 3), { start: 4, end: 7 })

// Cutting tidies exactly one doubled space.
assert.equal(cutSpan('the cat sat', { start: 4, end: 7 }), 'the sat')
assert.equal(cutSpan('the cat sat down', { start: 4, end: 11 }), 'the down')
// A cut running to the end of a line takes the space before it.
assert.equal(cutSpan('the cat', { start: 4, end: 7 }), 'the')
assert.equal(cutSpan('the cat\nnext', { start: 4, end: 7 }), 'the\nnext')
// No surrounding spaces, no tidying.
assert.equal(cutSpan('"cat"', { start: 1, end: 4 }), '""')

assert.equal(replaceSpan('the cat sat', { start: 4, end: 7 }, 'dog'), 'the dog sat')
assert.equal(replaceSpan('the cat sat', { start: 4, end: 7 }, ''), 'the  sat')

// A selection spanning paragraphs. The DOM hands back one newline between two blocks where the
// stored text has a blank line, and Chrome sometimes hands back none.
const twoParas = 'He left the room.\n\nThe door stayed open.'
assert.deepEqual(locate(twoParas, 'the room.\nThe door', 0), { start: 8, end: 27 })
assert.deepEqual(locate(twoParas, 'the room.The door', 0), null)
assert.deepEqual(locate(twoParas, 'the room.\n\nThe door', 0), { start: 8, end: 27 })

// Three paragraphs, with a dropped marker in the middle one.
const threeParas = 'One.\n\n*Two* here.\n\nThree.'
assert.deepEqual(locate(threeParas, 'One.\nTwo here.\nThree.', 0), { start: 0, end: 25 })

// Cutting a whole middle paragraph leaves one blank line, not two stacked.
assert.equal(cutSpan(threeParas, { start: 6, end: 17 }), 'One.\n\nThree.')
// A cut inside one line still leaves its newlines alone.
assert.equal(cutSpan('One.\n\nTwo three.', { start: 6, end: 10 }), 'One.\n\nthree.')

console.log('checkSelectionEdit ok')
