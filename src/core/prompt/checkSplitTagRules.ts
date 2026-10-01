// Run: node --experimental-strip-types src/core/prompt/checkSplitTagRules.ts
import assert from 'node:assert'
import type { TagRule } from '../stores/settingsStore.ts'
import { splitTagRules } from './textRules.ts'

const think: TagRule = { id: 't', open: '<think>||<thinking>', close: '</think>||</thinking>', mode: 'collapse', label: 'Thoughts' }
const split = splitTagRules([think])
assert.deepEqual(split.map((r) => [r.open, r.close]), [['<think>', '</think>'], ['<thinking>', '</thinking>']])
assert.ok(split.every((r) => r.id === 't' && r.label === 'Thoughts' && r.mode === 'collapse'))

// A single pair passes through as the same object, and a single `|` is part of the marker.
const plain: TagRule = { id: 'p', open: '[|', close: '|]', mode: 'hide' }
assert.equal(splitTagRules([plain])[0], plain)
assert.deepEqual(
  splitTagRules([{ ...think, open: '<a|b>||<c>', close: '</a|b>||</c>' }]).map((r) => [r.open, r.close]),
  [['<a|b>', '</a|b>'], ['<c>', '</c>']],
)

// An open with no matching close is dropped, as are empty halves.
assert.deepEqual(
  splitTagRules([{ ...think, open: '<a>||<b>||||', close: '</a>' }]).map((r) => r.open),
  ['<a>'],
)

console.log('checkSplitTagRules: ok')
