// Run: node --experimental-strip-types src/app/checkAutoHide.ts
import assert from 'node:assert'
import { stepHide, type HideState } from './useAutoHide.ts'

const run = (deltas: number[]) => deltas.reduce<HideState>(stepHide, { hidden: false, down: 0 })

assert.strictEqual(run([10, 10]).hidden, false, 'a nudge down keeps it')
assert.strictEqual(run([20, 20, 20]).hidden, true, 'a moment of scrolling hides it')
assert.strictEqual(run([60, -3]).hidden, true, 'jitter upward is ignored')
assert.strictEqual(run([60, -10]).hidden, false, 'a bit upward shows it')
assert.strictEqual(run([30, -10, 30]).hidden, false, 'an upward move resets the run')
assert.strictEqual(run([60, 0, 0]).hidden, true)
