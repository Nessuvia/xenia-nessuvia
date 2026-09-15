import assert from 'node:assert'
import { parseState, type TrackerDef } from './parseState.ts'
import { readTrackers, stripState, trackerPrompt, trackerValues, withTrackerUpdate, type TrackedMessage } from './trackerState.ts'
import { deletedSwipes } from '../stores/swipes.ts'

const defs: TrackerDef[] = [
  { key: 'affection', type: 'number', min: 0, max: 100, initial: 50 },
  { key: 'mood', type: 'text', options: ['calm', 'angry'] },
  { key: 'secret', type: 'text', hidden: true },
]

// A reply with two swipes: +10 on swipe 0, -10 on swipe 1.
const up = parseState('<state>affection: +10</state>', defs, { affection: 50 })
const down = parseState('<state>affection: -10</state>', defs, { affection: 50 })
let reply: TrackedMessage & { swipes: string[]; content: string } = { role: 'assistant', content: '', swipes: ['a', 'b'], swipeIndex: 0 }
reply = withTrackerUpdate(reply, up)
reply = withTrackerUpdate({ ...reply, swipeIndex: 1 }, down)
assert.equal(reply.trackerUpdates?.length, 2)

// Rollback: the selected swipe decides.
assert.equal(trackerValues(defs, [{ ...reply, swipeIndex: 0 }]).affection, 60)
assert.equal(trackerValues(defs, [{ ...reply, swipeIndex: 1 }]).affection, 40)
assert.equal(trackerValues(defs, []).affection, 50)
assert.equal(trackerValues(defs, []).mood, 'calm')

// Deleting a swipe keeps the updates parallel.
assert.equal(trackerValues(defs, [deletedSwipes({ ...reply, swipeIndex: 1 }, [0])!]).affection, 40)

// Override survival: a player edit on the message outlives a swipe, and a later reply builds on it.
const edited = { ...reply, trackerOverrides: { affection: 90 } }
assert.equal(trackerValues(defs, [{ ...edited, swipeIndex: 0 }]).affection, 90)
assert.equal(trackerValues(defs, [{ ...edited, swipeIndex: 1 }]).affection, 90)
const next = withTrackerUpdate({ role: 'assistant', content: '' }, parseState('<state>affection: +5</state>', defs, { affection: 90 }))
assert.equal(trackerValues(defs, [edited, { role: 'user' }, next]).affection, 95)
// Chat-level overrides are the base.
assert.equal(trackerValues(defs, [], { mood: 'angry' }).mood, 'angry')

// Display strip, closed and still streaming.
assert.equal(stripState('Hello.\n<state>affection: +5</state>'), 'Hello.')
assert.equal(stripState('Hello. <state>affec'), 'Hello.')
assert.equal(stripState('Plain.'), 'Plain.')

// Prompt: hidden trackers stay out, and nothing visible means no turn.
const prompt = trackerPrompt(defs, { affection: 60, mood: 'calm', secret: 'x' })
assert.match(prompt, /affection: 60 \(0 to 100\)/)
assert.doesNotMatch(prompt, /secret/)
assert.equal(trackerPrompt([defs[2]], {}), '')

// Card JSON: valid round-trips, junk drops.
const json = (v: unknown) => JSON.parse(JSON.stringify(v))
assert.deepEqual(json(readTrackers(json(defs))), defs)
assert.deepEqual(
  json(readTrackers([
    { key: 'bad key', type: 'list' },
    { key: 'x', type: 'number', min: 5, max: 1 },
    { key: 'y', type: 'bool' },
    { key: 'z', type: 'list' },
    { key: 'Z', type: 'list' },
    null,
  ])),
  [{ key: 'z', type: 'list' }],
)
