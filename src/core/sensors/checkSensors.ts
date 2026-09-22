import assert from 'node:assert'
import {
  newSensor,
  optionNames,
  readAnswer,
  sensorMax,
  sensorProblems,
  usableSensor,
  wireQuestion,
  type Sensor,
} from './sensor.ts'
import { attemptScore, knownReadings, windowedReadings, type ReadingHistory } from './average.ts'
import { firedGates, gateStages, meets, nudgeFrom, type Gate } from './gate.ts'
import { sensorState, widestPayload } from './state.ts'
import { defaultPostStackConfig } from '../agent/postStack.ts'

const score = (over: Partial<Sensor> = {}): Sensor => ({
  ...newSensor('score'),
  id: 'tone',
  label: 'tone',
  question: 'How well does `latest_turn` match `context`?',
  levels: ['Unrelated.', 'Mostly different.', 'Partly.', 'Mostly.', 'Fully.'],
  ...over,
})
const choice = (over: Partial<Sensor> = {}): Sensor => ({
  ...newSensor('choice'),
  id: 'mood',
  label: 'mood',
  question: 'What is the mood of `latest_turn`?',
  options: [{ name: 'calm', description: 'Nothing pressing.' }, { name: 'tense', description: 'Something is at stake.' }],
  ...over,
})
const noul = (over: Partial<Sensor> = {}): Sensor => ({
  ...newSensor('noul'),
  id: 'danger',
  label: 'danger',
  question: '`latest_turn` puts the player in danger.',
  levels: [],
  ...over,
})

const gate = (over: Partial<Gate> = {}): Gate => ({
  id: 'g',
  enabled: true,
  label: '',
  when: { sensorId: 'tone', op: 'below', value: 2, minConfidence: null },
  then: { kind: 'stages', enable: [], disable: [] },
  ...over,
})

// Wire shapes: each kind carries its criteria the way the endpoint takes them.
assert.deepStrictEqual(wireQuestion(score()).criteria, ['Unrelated.', 'Mostly different.', 'Partly.', 'Mostly.', 'Fully.'])
assert.deepStrictEqual(wireQuestion(choice()).criteria, { calm: 'Nothing pressing.', tense: 'Something is at stake.' })
// A noul sends both descriptions or neither, never one.
assert.strictEqual(wireQuestion(noul()).criteria, undefined)
assert.deepStrictEqual(wireQuestion(noul({ levels: ['Safe.', 'In danger.'] })).criteria, { false: 'Safe.', true: 'In danger.' })

// Reading: in range reads, out of range is a miss rather than a clamp.
assert.deepStrictEqual(readAnswer({ score: 3.4, confidence: 0.8 }, score()), { sensorId: 'tone', value: 3.4, confidence: 0.8 })
assert.strictEqual(readAnswer({ score: 9 }, score()), null)
assert.strictEqual(readAnswer({ score: -1 }, score()), null)
assert.strictEqual(readAnswer({ choice: 'furious' }, choice()), null)
assert.deepStrictEqual(readAnswer({ choice: 'tense' }, choice()), { sensorId: 'mood', value: 'tense', confidence: undefined })
assert.deepStrictEqual(readAnswer({ noul: 0.62 }, noul()), { sensorId: 'danger', value: 0.62 })
assert.strictEqual(readAnswer({ noul: 1.5 }, noul()), null)
assert.strictEqual(readAnswer(null, score()), null)
assert.strictEqual(sensorMax(score()), 4)
assert.strictEqual(sensorMax(noul()), 1)
assert.deepStrictEqual(optionNames(choice()), ['calm', 'tense'])

// Validation: a half-written sensor is never sent.
assert.deepStrictEqual(sensorProblems(score()), [])
assert.ok(sensorProblems(score({ question: '' })).length > 0)
assert.ok(sensorProblems(score({ levels: ['One.'] })).length > 0)
assert.ok(sensorProblems(choice({ options: [{ name: 'calm', description: '' }] })).length > 0)
assert.ok(sensorProblems(choice({ options: [{ name: 'calm', description: '' }, { name: 'calm', description: '' }] })).length > 0)
// Both noul descriptions or neither.
assert.ok(sensorProblems(noul({ levels: ['Safe.', ''] })).length > 0)
assert.deepStrictEqual(sensorProblems(noul({ levels: ['Safe.', 'In danger.'] })), [])
assert.strictEqual(usableSensor(score({ enabled: false })), false)

// Windowed average: a window of 3 means one dud doesn't drag the average under on its own.
const history: ReadingHistory = [
  [{ sensorId: 'tone', value: 4 }],
  [{ sensorId: 'tone', value: 3 }],
  [{ sensorId: 'tone', value: 0.5 }],
]
assert.deepStrictEqual(windowedReadings(history, [score({ window: 3 })]), [
  { sensorId: 'tone', value: 2.5, confidence: undefined },
])
// Window of 1 reads this reply alone, so the same history does fire a "below 2" gate.
assert.deepStrictEqual(windowedReadings(history, [score({ window: 1 })]), [
  { sensorId: 'tone', value: 0.5, confidence: undefined },
])
// A sensor with nothing in the window is absent rather than zero.
assert.deepStrictEqual(windowedReadings([[]], [score()]), [])
assert.deepStrictEqual(windowedReadings([], [score()]), [])
// A choice takes the most common value in the window, newest wins a tie.
const moods: ReadingHistory = [
  [{ sensorId: 'mood', value: 'calm' }],
  [{ sensorId: 'mood', value: 'tense' }],
]
assert.strictEqual(windowedReadings(moods, [choice({ window: 2 })])[0].value, 'tense')
// Confidence averages only when every reading in the window reported one.
const sure: ReadingHistory = [[{ sensorId: 'tone', value: 4, confidence: 0.6 }], [{ sensorId: 'tone', value: 2, confidence: 0.8 }]]
assert.strictEqual(windowedReadings(sure, [score({ window: 2 })])[0].confidence, 0.7)
const mixed: ReadingHistory = [[{ sensorId: 'tone', value: 4 }], [{ sensorId: 'tone', value: 2, confidence: 0.8 }]]
assert.strictEqual(windowedReadings(mixed, [score({ window: 2 })])[0].confidence, undefined)

// Readings for sensors the stack no longer has are dropped.
assert.deepStrictEqual(knownReadings([{ sensorId: 'gone', value: 1 }], [score()]), [])

// Gates fire at the boundary, not on it.
const below2 = gate()
assert.strictEqual(meets(below2.when, { sensorId: 'tone', value: 1.9 }, score()), true)
assert.strictEqual(meets(below2.when, { sensorId: 'tone', value: 2 }, score()), false)
assert.strictEqual(meets({ ...below2.when, op: 'above' }, { sensorId: 'tone', value: 2 }, score()), false)
assert.strictEqual(meets({ ...below2.when, op: 'above' }, { sensorId: 'tone', value: 2.1 }, score()), true)
// A missing reading never fires a gate.
assert.strictEqual(meets(below2.when, undefined, score()), false)
// Confidence floor: no reported confidence counts as not confident enough.
const sureGate = { ...below2.when, minConfidence: 0.7 }
assert.strictEqual(meets(sureGate, { sensorId: 'tone', value: 1, confidence: 0.9 }, score()), true)
assert.strictEqual(meets(sureGate, { sensorId: 'tone', value: 1, confidence: 0.5 }, score()), false)
assert.strictEqual(meets(sureGate, { sensorId: 'tone', value: 1 }, score()), false)
// A choice compares by name.
const isTense = { sensorId: 'mood', op: 'is' as const, value: 'tense', minConfidence: null }
assert.strictEqual(meets(isTense, { sensorId: 'mood', value: 'tense' }, choice()), true)
assert.strictEqual(meets({ ...isTense, op: 'isNot' }, { sensorId: 'mood', value: 'tense' }, choice()), false)

// A disabled gate never fires.
assert.deepStrictEqual(firedGates([gate({ enabled: false })], [{ sensorId: 'tone', value: 0 }], [score()]), [])
assert.strictEqual(firedGates([below2], [{ sensorId: 'tone', value: 0 }], [score()]).length, 1)
// A gate pointing at a sensor the stack no longer has never fires.
assert.deepStrictEqual(firedGates([gate({ when: { ...below2.when, sensorId: 'gone' } })], [{ sensorId: 'gone', value: 0 }], [score()]), [])

// Nudges from fired retry gates are deduped and joined.
const retry = (nudge: string, id: string) => gate({ id, then: { kind: 'retry', nudge } })
assert.strictEqual(nudgeFrom([retry('Push the tone darker.', 'a'), retry('Push the tone darker.', 'b')]), 'Push the tone darker.')
assert.strictEqual(nudgeFrom([retry('One.', 'a'), retry('Two.', 'b')]), 'One.\nTwo.')
assert.strictEqual(nudgeFrom([gate()]), '')

// Stage gating flips switches on the stack, and later gates win.
const base = defaultPostStackConfig()
base.dialoguePass = { enabled: false }
const on = gateStages(base, [gate({ then: { kind: 'stages', enable: ['dialogue'], disable: [] } })])
assert.strictEqual(on.dialoguePass.enabled, true)
assert.strictEqual(base.dialoguePass.enabled, false, 'gating must not edit the stored stack')
const off = gateStages(base, [
  gate({ id: 'a', then: { kind: 'stages', enable: ['dialogue'], disable: [] } }),
  gate({ id: 'b', then: { kind: 'stages', enable: [], disable: ['dialogue', 'rules'] } }),
])
assert.strictEqual(off.dialoguePass.enabled, false)
assert.strictEqual(off.rules.enabled, false)
// A stage nothing mentions keeps whatever the stack said.
assert.strictEqual(on.rules.enabled, base.rules.enabled)
// No stage gates at all returns the same object rather than a copy.
assert.strictEqual(gateStages(base, [retry('x', 'a')]), base)

// Best-of ranking: the higher-scoring attempt wins, and a choice-only watch ties at 0.
assert.ok(
  attemptScore([{ sensorId: 'tone', value: 4 }], [score()], ['tone']) >
    attemptScore([{ sensorId: 'tone', value: 1 }], [score()], ['tone']),
)
assert.strictEqual(attemptScore([{ sensorId: 'mood', value: 'tense' }], [choice()], ['mood']), 0)
assert.strictEqual(attemptScore([], [score()], ['tone']), 0)
// Scores and nouls are normalised to the same 0-1 range so a mixed watch is comparable.
assert.strictEqual(attemptScore([{ sensorId: 'tone', value: 2 }], [score()], ['tone']), 0.5)
assert.strictEqual(attemptScore([{ sensorId: 'danger', value: 0.5 }], [noul()], ['danger']), 0.5)

// State: the batch sends the union of what its sensors asked for.
assert.deepStrictEqual(
  widestPayload([
    score({ payload: { context: false, replies: 3, playerMessages: 1 } }),
    noul({ payload: { context: true, replies: 1, playerMessages: 2 } }),
  ]),
  { context: true, replies: 3, playerMessages: 2 },
)

const chat = [
  { role: 'user', content: 'U1' },
  { role: 'assistant', content: 'A1' },
  { role: 'user', content: 'U2' },
  { role: 'assistant', content: 'A2' },
]
// The reply being judged is always `latest_turn`, never a stored message: on a retry it's the
// attempt that just came back.
const one = sensorState([score({ payload: { context: false, replies: 1, playerMessages: 1 } })], 'NEW', chat)
assert.deepStrictEqual(one, { latest_turn: 'NEW', player_message: 'U2' })
// Anything beyond the two singles goes in `history`, in chat order, labelled by speaker.
const wide2 = sensorState([score({ payload: { context: false, replies: 3, playerMessages: 2 } })], 'NEW', chat)
assert.strictEqual(wide2.player_message, 'U2')
assert.strictEqual(wide2.history, 'Player:\nU1\n\nReply:\nA1\n\nReply:\nA2')
// Context is sent only when a sensor asked for it, and never as an empty field.
assert.strictEqual(sensorState([score()], 'NEW', chat, 'THE CARD').context, 'THE CARD')
assert.strictEqual(sensorState([score({ payload: { context: false, replies: 1, playerMessages: 1 } })], 'NEW', chat, 'THE CARD').context, undefined)
assert.strictEqual(sensorState([score()], 'NEW', chat, '   ').context, undefined)
// A sensor that wants nothing but the reply sends nothing but the reply.
assert.deepStrictEqual(sensorState([score({ payload: { context: false, replies: 1, playerMessages: 0 } })], 'NEW', chat), { latest_turn: 'NEW' })
assert.deepStrictEqual(sensorState([score()], 'NEW', []), { latest_turn: 'NEW' })

console.log('sensors ok')
