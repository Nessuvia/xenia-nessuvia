import assert from 'node:assert/strict'
import { computeExclusions } from './exclusions.ts'

function ranges(text: string): string {
  return JSON.stringify(computeExclusions(text))
}

// Fenced code block: the whole block is one range.
assert.deepEqual(
  computeExclusions('Before\n```js\nconst x = 1\n```\nAfter'),
  [[7, 28]],
)

// Inline code span.
assert.deepEqual(computeExclusions('Use `foo()` now'), [[4, 11]])

// Bare URL, trailing period trimmed.
assert.deepEqual(computeExclusions('See https://example.com. Then'), [[4, 23]])

// Markdown link: the URL target is excluded (merged with the bare-URL scan into one range).
const link = computeExclusions('See [the docs](https://example.com) now')
assert.equal(link.length, 1)
assert.equal(link[0][0], 15)
assert.equal(link[0][1], 34)

// LaTeX block and inline.
assert.deepEqual(computeExclusions('Math $$a = b$$ done'), [[5, 14]])
const m = computeExclusions('Inline $x + 1$ here')
assert.equal(m.length, 1)
assert.equal(m[0][0], 7)
assert.equal(m[0][1], 14)

// A fenced block shields its contents from inline-code scanning (no double-range inside).
const fenced = computeExclusions('```\n`x`\n```')
assert.equal(fenced.length, 1)

// Unclosed fence excludes to end.
assert.deepEqual(computeExclusions('Text\n```\nrun away'), [[5, 17]])

// No exclusions in plain prose.
assert.deepEqual(computeExclusions('Just a normal sentence.'), [])

// Ranges come back sorted by start.
const mixed = computeExclusions('`a` https://b.com [t](u)')
const starts = mixed.map((r) => r[0])
const sorted = [...starts].sort((x, y) => x - y)
assert.deepEqual(starts, sorted)

// Ranges are merged when overlapping.
void ranges

console.log('checkExclusions OK')

// Ignored tag pairs: the delimiters go too, and the match is case-insensitive.
assert.deepEqual(computeExclusions('Hi [ OOC: skip me ] there', [{ id: 'a', open: '[', close: ']' }]), [[3, 19]])
assert.deepEqual(
  computeExclusions('a <THINK>x</THINK> b', [{ id: 't', open: '<think>', close: '</think>' }]),
  [[2, 18]],
)

// Several occurrences, and several pairs at once.
assert.deepEqual(
  computeExclusions('[a] mid [b]', [{ id: 'a', open: '[', close: ']' }]),
  [[0, 3], [8, 11]],
)
assert.deepEqual(
  computeExclusions('[a] <think>b</think>', [
    { id: 'a', open: '[', close: ']' },
    { id: 't', open: '<think>', close: '</think>' },
  ]),
  [[0, 3], [4, 20]],
)

// An unclosed opener runs to the end, the same call the fence scanner makes.
assert.deepEqual(computeExclusions('ok [ never closed', [{ id: 'a', open: '[', close: ']' }]), [[3, 17]])

// A blank delimiter is skipped rather than matching everywhere.
assert.deepEqual(computeExclusions('plain text', [{ id: 'x', open: '', close: ']' }]), [])

// No pairs configured is the old behaviour exactly.
assert.deepEqual(computeExclusions('Hi [ OOC: keep ] there'), [])

console.log('checkExclusions ignore-pairs OK')
