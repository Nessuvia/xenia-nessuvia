import assert from 'node:assert'
import { checkInvariants, defaultInvariants, properNouns, quotedRuns } from './invariants.ts'

const all = { ...defaultInvariants }
const none = { ...all, newProperNouns: false, dialogue: false, lengthBand: false }

// A faithful rewrite of the same passage trips nothing.
assert.deepEqual(
  checkInvariants('She crossed the room and sat down.', 'She crossed the room and took the chair.', all),
  [],
)

// Proper nouns: a name the passage does not contain is a rejection.
const invented = checkInvariants('She crossed the room.', 'Sarah crossed the room.', all)
assert.equal(invented.length, 1)
assert.equal(invented[0].kind, 'properNoun')
assert.match(invented[0].detail, /Sarah/)

// A name already in the passage is fine, whatever the rewrite does with it.
assert.deepEqual(checkInvariants('Sarah crossed the room.', 'Sarah waited by the door instead.', all), [])

// The allowlist covers the names the chat knows about but this paragraph does not mention.
assert.deepEqual(
  checkInvariants('She crossed the room.', 'Sarah crossed the room.', { ...all, allowNames: ['Sarah Voss'] }),
  [],
)

// Dropping a name is not a violation: the invariant is about invention.
assert.deepEqual(checkInvariants('Sarah crossed the room.', 'She crossed the room.', all), [])

// Dialogue: rephrasing is allowed, inventing a line is not.
assert.deepEqual(
  checkInvariants('"I am not going," she said.', '"I am not going anywhere," she said.', all),
  [],
)
const madeUp = checkInvariants('She said nothing at all.', '"I never wanted this," she said.', all)
assert.ok(madeUp.some((v) => v.kind === 'dialogue'))
const lost = checkInvariants('"I am not going," she said.', 'She refused, and that was that.', all)
assert.ok(lost.some((v) => v.kind === 'dialogue'))

// Curly quotes count as speech too.
assert.deepEqual(quotedRuns('“Go on,” he said.'), ['Go on,'])
assert.deepEqual(quotedRuns('"One," and "two."'), ['One,', 'two.'])
assert.deepEqual(quotedRuns("It's fine, she thought."), [], 'apostrophes are not speech')

// The per-chunk length band is the whole-message guard applied narrower.
const long = 'She crossed the room and sat down by the window to wait for him to come back.'
assert.ok(checkInvariants(long, 'She sat.', all).some((v) => v.kind === 'lengthBand'))
assert.deepEqual(checkInvariants(long, 'She sat.', { ...all, lengthBand: false }), [])

// Each toggle is independent, and with all of them off nothing is ever rejected.
assert.deepEqual(checkInvariants('She left.', '"Marcus!" Anne shouted, over and over and over again.', none), [])
assert.equal(
  checkInvariants('She left.', 'Marcus left.', { ...none, newProperNouns: true }).length,
  1,
)

// Proper-noun extraction ignores code and sentence-initial ordinary words.
assert.ok(!properNouns('The door opened. Rain fell.').includes('rain'))
assert.ok(properNouns('Marcus opened the door.').includes('marcus'))
assert.ok(!properNouns('`Marcus` is a variable name.').includes('marcus'))

// Empty input does not throw.
assert.doesNotThrow(() => checkInvariants('', '', all))
assert.doesNotThrow(() => checkInvariants('text', '', all))

console.log('checkInvariants ok')
