import assert from 'node:assert/strict'
import { CompromiseTagger } from './tagger.ts'
import { compilePattern, PatternError } from './pattern.ts'
import { findMatches } from './matcher.ts'

const tagger = new CompromiseTagger()
const hits = (text: string, dsl: string) =>
  findMatches(tagger.tokenize(text), compilePattern(dsl)).map((m) => text.slice(m.start, m.end))

// It stops at the next mark.
assert.deepEqual(hits('He sat there quietly, watching the door.', 'sat [clause]'), ['sat there quietly'])
assert.deepEqual(hits('He sat there quietly; the door stayed shut.', 'sat [clause]'), ['sat there quietly'])

// And at the end of the sentence when no mark comes first.
assert.deepEqual(hits('He sat there quietly. She left.', 'sat [clause]'), ['sat there quietly'])

// It never crosses a sentence, the standing limit on every pattern.
assert.deepEqual(hits('He sat. She left the room.', 'sat [clause]'), [])

// One or more, so it needs something to take. A mark right after the previous matcher means the
// clause is already over: unlike every other slot, `[clause]` is not allowed to step over it.
assert.deepEqual(hits('He sat, then left.', 'sat [clause]'), [])
assert.deepEqual(hits('He sat down, then left.', 'sat [clause]'), ['sat down'])
// Writing the comma is how a rule asks for the clause after it.
assert.deepEqual(hits('He sat, then left.', 'sat , [clause]'), ['sat, then left'])

// A quantifier still means what it says.
assert.deepEqual(hits('He sat there quietly and waited.', 'sat [clause]{2}'), ['sat there quietly'])

// It is a slot like any other, so it can be followed and captured.
const m = findMatches(tagger.tokenize('She waited there a while, then left.'), compilePattern('waited [clause]'))[0]
assert.equal(m.groups.length, 2)
assert.equal('She waited there a while, then left.'.slice(m.groups[1].start, m.groups[1].end), 'there a while')

assert.throws(() => compilePattern('sat [clauses]'), PatternError)

console.log('checkClause OK')
