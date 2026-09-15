import assert from 'node:assert/strict'
import { CompromiseTagger } from './tagger.ts'
import { compilePattern } from './pattern.ts'
import { findMatches } from './matcher.ts'

const tagger = new CompromiseTagger()
const hits = (text: string, dsl: string) =>
  findMatches(tagger.tokenize(text), compilePattern(dsl)).map((m) => text.slice(m.start, m.end))

// Separators between matchers are flexible: the rule says nothing about the comma and matches
// whether or not one is there.
assert.deepEqual(hits('She waited, quietly.', 'waited quietly'), ['waited, quietly'])
assert.deepEqual(hits('She waited quietly.', 'waited quietly'), ['waited quietly'])
assert.deepEqual(hits('She waited; quietly.', 'waited quietly'), ['waited; quietly'])

// A literal comma is a matcher of its own, and it is required. Written with a space in front, so
// punctuation stuck to the previous token stays optional the way it always was.
assert.deepEqual(hits('She gripped the rail, knuckles pale.', 'rail , knuckles'), ['rail, knuckles'])
assert.deepEqual(hits('She gripped the rail knuckles pale.', 'rail , knuckles'), [])
// Stuck to the token, it is stripped and the match is the same either way.
assert.deepEqual(hits('She gripped the rail knuckles pale.', 'rail, knuckles'), ['rail knuckles'])

// No POS slot and no wildcard ever matches punctuation: four `[word]` slots take four words and
// step over the comma between them rather than spending a slot on it.
assert.deepEqual(hits('He left, she stayed.', '[word] [word] [word] [word]'), ['He left, she stayed'])
assert.deepEqual(hits('He left, she did.', '[word] [word] [word]'), ['He left, she'])

// A quantified slot stops at a mark rather than running through it.
assert.deepEqual(hits('He waited, tired and cold.', 'waited [word]+'), ['waited, tired and cold'])
assert.deepEqual(hits('He waited and rested, tired.', 'waited [word]+'), ['waited and rested'])

// Offsets stay true to the source: the match span is the text, marks included where they fall
// between two matched words.
const m = findMatches(tagger.tokenize('She waited, quietly.'), compilePattern('waited quietly'))[0]
assert.equal(m.start, 4)
assert.equal(m.end, 19)

console.log('checkPunctuation OK')
