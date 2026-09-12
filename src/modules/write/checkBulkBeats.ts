// Run: node --experimental-strip-types src/modules/write/checkBulkBeats.ts
import assert from 'node:assert'
import { mapWeights, parseBulkBeats } from './bulkBeats.ts'

const ok = (input: string) => {
  const out = parseBulkBeats(input)
  assert.strictEqual(out.error, '', `${input} -> ${out.error}`)
  return out
}
const bad = (input: string) => {
  const out = parseBulkBeats(input)
  assert.notStrictEqual(out.error, '', `${input} should not parse`)
  return out.error
}

// --- the documented shape -----------------------------------------------------
const full = ok(`[
  {
    "content": "The protagonist discovers a hidden map.",
    "length": "long"
  },
  {
    "content": "They board the charter boat.",
    "length": "brief"
  }
]`)
assert.deepStrictEqual(full.beats, [
  { beat: 'The protagonist discovers a hidden map.', length: 'long' },
  { beat: 'They board the charter boat.', length: 'brief' },
])
assert.deepStrictEqual(full.unknown, [])
assert.deepStrictEqual(mapWeights(full.beats), [
  { beat: 'The protagonist discovers a hidden map.', weight: 'long' },
  { beat: 'They board the charter boat.', weight: 'brief' },
])

// A field we do not have is ignored rather than rejected: the paste came from somewhere else.
assert.deepStrictEqual(ok('[{"name":"Act one","content":"a"}]').beats, [
  { beat: 'a', length: 'normal' },
])

// Casing is not the Author's problem.
assert.strictEqual(ok('[{"content":"a","length":"MAJOR"}]').unknown.length, 0)
assert.strictEqual(mapWeights(ok('[{"content":"a","length":"Major"}]').beats)[0].weight, 'major')

// --- optional fields ------------------------------------------------------------
// No length is a normal beat.
assert.deepStrictEqual(ok('[{"content":"a"}]').beats, [{ beat: 'a', length: 'normal' }])
// A bare array of strings: the strings are the contents.
assert.deepStrictEqual(ok('["a","b"]').beats, [
  { beat: 'a', length: 'normal' },
  { beat: 'b', length: 'normal' },
])

// --- unknown lengths: collected for remapping, never guessed --------------------
const odd = ok('[{"content":"a","length":"short"},{"content":"b","length":"epic"},{"content":"c","length":"short"}]')
// Deduplicated, in first-appearance order.
assert.deepStrictEqual(odd.unknown, ['short', 'epic'])
// The raw value survives the parse. The dialog can show what was actually written.
assert.strictEqual(odd.beats[0].length, 'short')
// Mapped, they become the Author's answers.
assert.deepStrictEqual(
  mapWeights(odd.beats, { short: 'brief', epic: 'major' }).map((b) => b.weight),
  ['brief', 'major', 'brief'],
)
// Unanswered, they fall back rather than losing the beat.
assert.deepStrictEqual(mapWeights(odd.beats).map((b) => b.weight), ['normal', 'normal', 'normal'])
assert.deepStrictEqual(
  mapWeights(odd.beats, { short: 'brief' }).map((b) => b.weight),
  ['brief', 'normal', 'brief'],
)

// --- untrusted input ------------------------------------------------------------
const messy = ok('[{"content":"Two\\n  lines","length":42},null,["nope"],{},{"content":"b"}]')
assert.deepStrictEqual(messy.beats, [
  // Newlines fold: a beat's content is one line. A non-string length is still a value to remap.
  { beat: 'Two lines', length: '42' },
  { beat: 'b', length: 'normal' },
])
assert.deepStrictEqual(messy.unknown, ['42'])
// Quotes and backslashes are JSON's problem now, and it handles them.
assert.strictEqual(ok('[{"content":"She says \\"no\\""}]').beats[0].beat, 'She says "no"')
assert.strictEqual(ok('[{"content":"C:\\\\path"}]').beats[0].beat, 'C:\\path')

// --- rejections -------------------------------------------------------------------
assert.match(bad(''), /Nothing to add/)
assert.match(bad('   '), /Nothing to add/)
assert.match(bad('{"content":"a"}'), /array of beats/)
assert.match(bad('[{"content":"a"}'), /not valid JSON/)
assert.match(bad('{"text",200}'), /not valid JSON/)
// An array with nothing usable in it adds nothing, and says so.
assert.match(bad('[]'), /Nothing to add/)
assert.match(bad('[null,{},["x"]]'), /Nothing to add/)
// An entry with a length and no content adds nothing.
assert.match(bad('[{"length":"long"}]'), /Nothing to add/)

console.log('checkBulkBeats ok')
