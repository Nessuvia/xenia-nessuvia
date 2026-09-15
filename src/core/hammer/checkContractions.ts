import assert from 'node:assert/strict'
import { CompromiseTagger } from './tagger.ts'
import { compilePattern } from './pattern.ts'
import { findMatches } from './matcher.ts'

const tagger = new CompromiseTagger()
const hits = (text: string, dsl: string, caseSensitive = false) =>
  findMatches(tagger.tokenize(text), compilePattern(dsl, caseSensitive)).map((m) => text.slice(m.start, m.end))

// Written out, the rule matches the contraction. The span is the whole word, so a swap replaces
// "didn't" rather than half of it.
assert.deepEqual(hits("She didn't smile.", 'did not'), ["didn't"])
assert.deepEqual(hits("He won't go.", 'will not'), ["won't"])
assert.deepEqual(hits("They're here.", 'they are'), ["They're"])
assert.deepEqual(hits("You'd know.", 'you would'), ["You'd"])

// And the other direction: written as a contraction, the rule matches the expanded form too,
// because the literal is expanded through the same tagger.
assert.deepEqual(hits('She did not smile.', "didn't"), ['did not'])
assert.deepEqual(hits("She didn't smile.", "didn't"), ["didn't"])

// The reading is compromise's, and it is context-sensitive. This is the decision on record: a rule
// asking for one reading does not fire on the other.
assert.deepEqual(hits("It's fine.", 'it is'), ["It's"])
assert.deepEqual(hits("It's fine.", 'it has'), [])
assert.deepEqual(hits("It's been a long day.", 'it has'), ["It's"])
assert.deepEqual(hits("It's been a long day.", 'it is'), [])

// A match may not start or end in the middle of a pair. "not" alone would otherwise take the
// whole of "didn't" with it.
assert.deepEqual(hits("She didn't smile.", 'not'), [])
assert.deepEqual(hits('She would not smile.', 'not'), ['not'])
assert.deepEqual(hits("She didn't smile.", 'did'), [])
assert.deepEqual(hits('She did smile.', 'did'), ['did'])

// Case. The surface is capitalised at the start of a sentence; matching is on the implicit word,
// which compromise gives in lower case, so a case-sensitive rule has to be written that way.
assert.deepEqual(hits("They're here.", 'they are', true), ["They're"])
assert.deepEqual(hits("They're here.", 'They are', true), [])

// "gonna" fuses without an apostrophe, and expands the same way.
assert.deepEqual(hits('He is gonna leave.', 'gonna'), ['gonna'])
assert.deepEqual(hits('He is going to leave.', 'gonna'), ['going to'])

// A fused form is one chip and so one `$n`, however many words it matches as.
const one = findMatches(tagger.tokenize("She didn't smile."), compilePattern("didn't"))[0]
assert.equal(one.groups.length, 1)
assert.equal("She didn't smile.".slice(one.groups[0].start, one.groups[0].end), "didn't")
const two = findMatches(tagger.tokenize('She did not smile.'), compilePattern('did not'))[0]
assert.equal(two.groups.length, 2)

console.log('checkContractions OK')
