import assert from 'node:assert'
import { parseState, type TrackerDef } from './parseState.ts'

const defs: TrackerDef[] = [
  { key: 'affection', type: 'number', min: 0, max: 100 },
  { key: 'mood', type: 'text', options: ['calm', 'angry'] },
  { key: 'location', type: 'text' },
  { key: 'inventory', type: 'list' },
]
const current = { affection: 50, mood: 'calm', location: 'inn', inventory: ['rope'] }

// Valid: delta, absolute, text, list add and remove.
let r = parseState('Hi.<state>affection: +5</state>', defs, current)
assert.deepEqual(r, { changes: [{ key: 'affection', value: 55 }], failures: [] })
r = parseState('<state>\naffection: 60\nMood: Angry\nlocation: forest\ninventory: +sword\n</state>', defs, current)
assert.deepEqual(r.failures, [])
assert.deepEqual(r.changes.map((c) => c.value), [60, 'angry', 'forest', ['rope', 'sword']])
r = parseState('<state>inventory: -rope</state>', defs, current)
assert.deepEqual(r.changes, [{ key: 'inventory', value: [] }])
r = parseState('<state>inventory: a, b</state>', defs, current)
assert.deepEqual(r.changes, [{ key: 'inventory', value: ['a', 'b'] }])

// Later blocks build on earlier ones.
r = parseState('<state>affection: -10</state> ... <state>affection: -10</state>', defs, current)
assert.deepEqual(r.changes.map((c) => c.value), [40, 30])

// Malformed: a failure drops its whole block and names the attempt.
r = parseState('<state>affection: +5\naffection plenty</state>', defs, current)
assert.deepEqual(r.changes, [])
assert.equal(r.failures.length, 1)
assert.equal(r.failures[0].attempted, 'affection plenty')
assert.ok(r.failures[0].error)
assert.equal(parseState('<state>charm: 5</state>', defs, current).failures.length, 1)
assert.equal(parseState('<state>affection: lots</state>', defs, current).failures.length, 1)
assert.equal(parseState('<state>mood: sleepy</state>', defs, current).failures.length, 1)
assert.equal(parseState('<state>inventory: -gold</state>', defs, current).failures.length, 1)
assert.equal(parseState('<state>affection: +5', defs, current).failures.length, 1)
assert.equal(parseState('<state>affection: +5', defs, current).changes.length, 0)

// Out of range: absolute and delta both fail.
assert.equal(parseState('<state>affection: 101</state>', defs, current).failures.length, 1)
r = parseState('<state>affection: -60</state>', defs, current)
assert.deepEqual(r.changes, [])
assert.match(r.failures[0].error, /outside 0 to 100/)

// No block, no changes.
assert.deepEqual(parseState('Plain reply.', defs, current), { changes: [], failures: [] })
