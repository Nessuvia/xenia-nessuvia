import assert from 'node:assert'
import { findSlop, compileEntry, type LexiconEntry } from './lexicon.ts'

const lit = (id: string, phrase: string, weight = 1): LexiconEntry =>
  ({ id, phrase, regex: false, enabled: true, weight })

// A literal fires on the phrase and nowhere else.
assert.equal(findSlop('She swallowed hard and went in.', [lit('a', 'swallowed hard')]).length, 1)
assert.equal(findSlop('Nothing tired here at all.', [lit('a', 'swallowed hard')]).length, 0)

// Word boundaries: a literal does not fire inside a longer word.
assert.equal(findSlop('He delved in.', [lit('d', 'delve')]).length, 0)
assert.equal(findSlop('Let us delve into it.', [lit('d', 'delve')]).length, 1)

// A disabled entry is silent, and so is a blank one.
assert.equal(findSlop('swallowed hard', [{ ...lit('a', 'swallowed hard'), enabled: false }]).length, 0)
assert.equal(findSlop('anything', [lit('a', '   ')]).length, 0)

// Code is not prose.
assert.equal(findSlop('`swallowed hard` in the log', [lit('a', 'swallowed hard')]).length, 0)
assert.equal(findSlop('https://example.com/delve', [lit('d', 'delve')]).length, 0)

// One phrase used many times is capped, not reported once per occurrence.
const many = 'swallowed hard. '.repeat(10)
assert.equal(findSlop(many, [lit('a', 'swallowed hard')]).length, 3)

// Hits carry the entry's weight and a usable span.
const [hit] = findSlop('And then, a ghost of a smile.', [{ id: 'g', phrase: 'a ghost of a smile', regex: false, enabled: true, weight: 3 }])
assert.equal(hit.weight, 3)
assert.equal('And then, a ghost of a smile.'.slice(hit.span!.start, hit.span!.end), 'a ghost of a smile')
assert.equal(hit.source, 'slop:g')

// A regex entry matches its pattern; a broken one is skipped rather than thrown.
const re: LexiconEntry = { id: 'r', phrase: 'eyes (darkened|darkening)', regex: true, enabled: true, weight: 2 }
assert.equal(findSlop('His eyes darkened.', [re]).length, 1)
assert.equal(compileEntry({ ...re, phrase: '(unclosed' }), null)
assert.doesNotThrow(() => findSlop('anything at all', [{ ...re, phrase: '(unclosed' }]))

console.log('checkLexicon ok')
