import assert from 'node:assert'
import { splitChunks, alignChunks, similarity, type Chunk } from './chunks.ts'

// Paragraphs, with offsets that point back at the source.
const three = 'First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.'
const split = splitChunks(three)
assert.equal(split.length, 3)
assert.equal(split[1].text, 'Second paragraph here.')
assert.equal(three.slice(split[2].start, split[2].end), 'Third paragraph here.')

// A ragged separator is still one boundary, and leading whitespace is not part of the chunk.
const ragged = splitChunks('  One.  \n   \n\n  Two.  ')
assert.equal(ragged.length, 2)
assert.deepEqual(ragged.map((c) => c.text), ['One.', 'Two.'])

// Empty in, empty out. No chunk is ever whitespace.
assert.deepEqual(splitChunks(''), [])
assert.deepEqual(splitChunks('\n\n   \n\n'), [])

// A long paragraph splits at sentence boundaries, and the pieces reassemble to the original words.
const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} runs on for a while here.`).join(' ')
const pieces = splitChunks(long)
assert.ok(pieces.length > 1, 'a 1800-char paragraph should split')
assert.ok(pieces.every((p) => p.text.length <= 900), 'no piece should be wildly over the cap')
assert.equal(pieces.map((p) => p.text).join(' '), long)

// No terminal punctuation means nothing to split on, so it stays whole rather than being cut mid-word.
const unpunctuated = 'word '.repeat(200).trim()
assert.equal(splitChunks(unpunctuated).length, 1)

// Alignment: equal counts pair by index.
const a = splitChunks('One alpha.\n\nTwo beta.\n\nThree gamma.')
const b = splitChunks('One alpha rewritten.\n\nTwo beta rewritten.\n\nThree gamma rewritten.')
const even = alignChunks(a, b)
assert.equal(even.length, 3)
assert.ok(even.every((x) => x.kind === 'pair'))
assert.equal(even[1].kind === 'pair' && even[1].to[0].text, 'Two beta rewritten.')

// A merge: two originals answered by one rewritten paragraph.
const merged = alignChunks(a, splitChunks('One alpha rewritten. Two beta rewritten.\n\nThree gamma rewritten.'))
assert.equal(merged.length, 2)
assert.equal(merged[0].kind, 'pair')
assert.equal(merged[0].kind === 'pair' && merged[0].from.length, 2)
assert.equal(merged[0].kind === 'pair' && merged[0].to.length, 1)

// A split: one original answered by two rewritten paragraphs.
const widened = alignChunks(
  splitChunks('One alpha and two beta together.\n\nThree gamma.'),
  splitChunks('One alpha.\n\nTwo beta together.\n\nThree gamma.'),
)
assert.equal(widened.length, 2)
assert.equal(widened[0].kind === 'pair' && widened[0].to.length, 2)

// A dropped paragraph: the original with no answer comes back unmatched.
const dropped = alignChunks(a, splitChunks('One alpha rewritten.\n\nThree gamma rewritten.'))
assert.equal(dropped.length, 3)
assert.equal(dropped[1].kind, 'unmatched')
assert.equal(dropped[1].from[0].text, 'Two beta.')

// Every original is always accounted for, whatever the rewrite did.
for (const alignment of [even, merged, widened, dropped]) {
  const seen = alignment.flatMap((x) => x.from.map((c: Chunk) => c.text))
  assert.equal(seen.length, new Set(seen).size, 'no original chunk is used twice')
}

// An empty rewrite leaves everything unmatched rather than throwing.
assert.ok(alignChunks(a, []).every((x) => x.kind === 'unmatched'))
assert.deepEqual(alignChunks([], b), [])

// Similarity: identical text is 1, unrelated text is near 0, a reworded sentence is in between.
assert.equal(similarity('the quick brown fox', 'the quick brown fox'), 1)
assert.ok(similarity('the quick brown fox', 'entirely unrelated wording throughout') < 0.25)
const partial = similarity('she crossed the room and sat down', 'she crossed the room and stood there')
assert.ok(partial > 0.25 && partial < 1, `expected a middling score, got ${partial}`)

// Case and apostrophes do not hide a match.
assert.equal(similarity("Don't stop now", 'DONT STOP NOW'), 1)

console.log('checkChunks ok')
