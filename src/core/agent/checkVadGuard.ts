import assert from 'node:assert'
import { defaultVadLimits, vadAllows } from './vadGuard.ts'
import { loadVad } from '../quality/vad.ts'
import { runAgent, type Complete } from './runAgent.ts'
import { defaultFlowPassConfig } from './postStack.ts'

const vad = (v: number, a: number, d: number) => ({ v, a, d })
const limits = { swing: 0.2, towardLast: 0.15 }

// The plan's guard table.
// Reference edit: gloom lifted toward the joke it answers.
assert.ok(vadAllows(vad(0.35, 0.3, 0.3), vad(0.6, 0.3, 0.3), vad(0.7, 0.4, 0.3), limits))
// Softened grief: the same lift away from a sad scene.
assert.ok(!vadAllows(vad(0.2, 0.3, 0.3), vad(0.45, 0.3, 0.3), vad(0.1, 0.3, 0.3), limits))
// Flattened anger.
assert.ok(!vadAllows(vad(0.3, 0.8, 0.5), vad(0.3, 0.4, 0.5), undefined, limits))
// Small smoothing.
assert.ok(vadAllows(vad(0.5, 0.3, 0.3), vad(0.55, 0.3, 0.3), undefined, limits))
// Arousal is tighter than valence: the same change passes on v and blocks on a.
assert.ok(vadAllows(vad(0, 0, 0), vad(0.18, 0, 0), undefined, limits))
assert.ok(!vadAllows(vad(0, 0, 0), vad(0, 0.18, 0), undefined, limits))

// runAgent's flow pass: accepted when every guard passes, the original kept when one fails.
await loadVad()
const reply = '"You still can," he said. He sat down on the mat. He looked at her for a while.'
const run = (answers: string[]) => {
  const calls: string[] = []
  const complete: Complete = async (messages) => {
    calls.push(messages[0].content)
    return answers.shift() ?? ''
  }
  return runAgent(reply, { maxTries: 1, rules: [], lexicon: [], flowPass: { ...defaultFlowPassConfig, ...defaultVadLimits } }, complete).then((r) => ({ r, calls }))
}

let { r, calls } = await run(['"You still can," he said, and sat down on the mat. He looked at her for a while.'])
assert.equal(calls.length, 1)
assert.match(calls[0], /smooth the flow/)
assert.equal(r.text, '"You still can," he said, and sat down on the mat. He looked at her for a while.')
assert.match(r.summary ?? '', /smoothed the flow/)

// Dialogue changed: rejected.
;({ r } = await run(['"You still could," he said, and sat down on the mat. He looked at her for a while.']))
assert.equal(r.text, reply)
// Sentence count collapsed past the drift: rejected.
;({ r } = await run(['"You still can," he said, sat down on the mat, and looked at her for a while.']))
assert.equal(r.text, reply)
