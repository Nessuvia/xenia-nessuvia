import assert from 'node:assert'
import { runTrack, type TrackDeps } from './runTrack.ts'
import { defaultPostStackConfig, type PostStackConfig } from './postStack.ts'
import { newSensor, type Reading, type Sensor } from '../sensors/sensor.ts'
import type { Gate } from '../sensors/gate.ts'

const tone: Sensor = {
  ...newSensor('score'),
  id: 'tone',
  label: 'tone',
  question: 'How well does `latest_turn` match `context`?',
  levels: ['Unrelated.', 'Mostly different.', 'Partly.', 'Mostly.', 'Fully.'],
}

const retryGate: Gate = {
  id: 'retry',
  enabled: true,
  label: '',
  when: { sensorId: 'tone', op: 'below', value: 2, minConfidence: null },
  then: { kind: 'retry', nudge: 'Push the scene toward the intended tone.' },
}

const dialogueGate: Gate = {
  id: 'dialogue',
  enabled: true,
  label: '',
  when: { sensorId: 'tone', op: 'below', value: 2, minConfidence: null },
  then: { kind: 'stages', enable: [], disable: ['rules'] },
}

/** A stack with no rewrite rules and every model-calling stage off, so `runAgent` makes no calls. */
function stack(over: Partial<PostStackConfig> = {}): PostStackConfig {
  const config = defaultPostStackConfig()
  config.rules = { enabled: true, list: [] }
  config.swaps = { enabled: true, lexicon: [{ id: 'u', phrase: 'utilize', replacement: 'use', enabled: true }] }
  config.lint = { ...config.lint, enabled: false }
  config.flow = { ...config.flow, enabled: false }
  config.flowPass = undefined as unknown as PostStackConfig['flowPass']
  config.dialoguePass = { enabled: false }
  config.sensors = { enabled: true, list: [tone] }
  config.gates = { enabled: true, list: [] }
  config.retryCap = 2
  return { ...config, ...over }
}

/** Fake deps: sensor answers come from a queue, regenerated replies from another. */
function deps(scores: number[], replies: string[] = []) {
  const asked: string[] = []
  const nudges: string[] = []
  const made: TrackDeps = {
    ask: async (text) => {
      asked.push(text)
      const score = scores.shift()
      return score === undefined ? [] : ([{ sensorId: 'tone', value: score }] as Reading[])
    },
    regenerate: async (nudge) => {
      nudges.push(nudge)
      return replies.shift() ?? ''
    },
    complete: async () => '',
  }
  return { deps: made, asked, nudges }
}

// No gates: the reply is sensed, kept, and cleaned. Swaps still run.
let d = deps([3])
let out = await runTrack('They utilize the door.', stack(), d.deps)
assert.strictEqual(out.text, 'They use the door.')
assert.deepStrictEqual(out.readings, [{ sensorId: 'tone', value: 3 }])
assert.strictEqual(out.attempts.length, 1)
assert.strictEqual(d.nudges.length, 0, 'no gate fired, so nothing was asked again')
assert.ok(out.senseSummary?.includes('tone 3.0'))

// A score above the threshold leaves the retry gate alone.
d = deps([2])
out = await runTrack('A.', stack({ gates: { enabled: true, list: [retryGate] } }), d.deps)
assert.strictEqual(d.nudges.length, 0, 'below 2 must not fire on exactly 2')

// A low score fires the retry, and a good second attempt wins and stops the loop.
d = deps([1, 4], ['The better reply.'])
out = await runTrack('The dud.', stack({ gates: { enabled: true, list: [retryGate] } }), d.deps)
assert.deepStrictEqual(d.nudges, ['Push the scene toward the intended tone.'])
assert.strictEqual(out.text, 'The better reply.')
assert.strictEqual(out.attempts.length, 2)
assert.deepStrictEqual(out.readings, [{ sensorId: 'tone', value: 4 }])
assert.ok(out.senseSummary?.includes('Asked again once'))
assert.ok(out.senseSummary?.includes('kept the last'))

// The cap holds even when every attempt scores badly, and the best of them is kept.
d = deps([0, 1, 0.5], ['Second.', 'Third.'])
out = await runTrack('First.', stack({ gates: { enabled: true, list: [retryGate] } }), d.deps)
assert.strictEqual(d.nudges.length, 2, 'retryCap is 2, so it asks again twice and stops')
assert.strictEqual(out.attempts.length, 3)
assert.strictEqual(out.text, 'Second.', 'the best-scoring attempt wins, not the last')

// A tie keeps the earliest, so a later attempt has to actually be better.
d = deps([1, 1], ['Second.'])
out = await runTrack('First.', stack({ gates: { enabled: true, list: [retryGate] } }), d.deps)
assert.strictEqual(out.text, 'First.')

// retryCap 0 never asks again, however bad the score.
d = deps([0])
out = await runTrack('The dud.', stack({ retryCap: 0, gates: { enabled: true, list: [retryGate] } }), d.deps)
assert.strictEqual(d.nudges.length, 0)
assert.strictEqual(out.text, 'The dud.')

// An empty regeneration is a failed call: keep what we have rather than replacing it with nothing.
d = deps([0], [''])
out = await runTrack('The dud.', stack({ gates: { enabled: true, list: [retryGate] } }), d.deps)
assert.strictEqual(out.text, 'The dud.')
assert.strictEqual(out.attempts.length, 1)

// A stage gate turns a cleanup stage off for this reply only.
const swapRule = {
  id: 'r', enabled: true, match: 'regex' as const, find: 'door', caseSensitive: false,
  action: 'swap' as const, replacement: 'gate', note: '',
}
const gated = stack({ rules: { enabled: true, list: [swapRule] }, gates: { enabled: true, list: [dialogueGate] } })
d = deps([4])
out = await runTrack('The door.', gated, d.deps)
assert.strictEqual(out.text, 'The gate.', 'a high score leaves the rules stage on')
d = deps([0])
out = await runTrack('The door.', gated, d.deps)
assert.strictEqual(out.text, 'The door.', 'a low score disabled the rules stage')
assert.strictEqual(gated.rules.enabled, true, 'gating must not edit the stored stack')

// Sensors off: no decisions call at all, and the pass behaves exactly as it did before sensors existed.
d = deps([3])
out = await runTrack('They utilize the door.', stack({ sensors: { enabled: false, list: [tone] } }), d.deps)
assert.strictEqual(d.asked.length, 0)
assert.strictEqual(out.text, 'They use the door.')
assert.strictEqual(out.senseSummary, undefined)

// A sensor outage costs no reply: the track carries on and still cleans.
const broken: TrackDeps = {
  ask: async () => { throw new Error('the endpoint could not be reached') },
  regenerate: async () => '',
  complete: async () => '',
}
out = await runTrack('They utilize the door.', stack({ gates: { enabled: true, list: [retryGate] } }), broken)
assert.strictEqual(out.text, 'They use the door.')
assert.deepStrictEqual(out.readings, [])

// An abort is the user stopping and has to reach the caller.
const stopped: TrackDeps = {
  ask: async () => { throw Object.assign(new Error('Aborted'), { name: 'AbortError' }) },
  regenerate: async () => '',
  complete: async () => '',
}
await assert.rejects(() => runTrack('A.', stack(), stopped), /Aborted/)

// The window is what a gate reads: three replies averaged keeps one dud from firing a retry.
d = deps([0])
const wide = stack({ sensors: { enabled: true, list: [{ ...tone, window: 3 }] }, gates: { enabled: true, list: [retryGate] } })
out = await runTrack('The dud.', wide, d.deps, { history: [[{ sensorId: 'tone', value: 4 }], [{ sensorId: 'tone', value: 4 }]] })
assert.strictEqual(d.nudges.length, 0, 'the average is 2.67, so the gate stays shut')
assert.deepStrictEqual(out.readings, [{ sensorId: 'tone', value: 0 }], 'the stored reading is this reply, not the average')

// Phases are reported in order so the chat can show what the track is doing.
const phases: string[] = []
d = deps([0, 4], ['Better.'])
await runTrack('Dud.', stack({ gates: { enabled: true, list: [retryGate] } }), d.deps, {
  onPhase: (phase) => phases.push(phase.kind),
})
assert.deepStrictEqual(phases, ['sense', 'retry', 'sense', 'clean'])

console.log('runTrack ok')
