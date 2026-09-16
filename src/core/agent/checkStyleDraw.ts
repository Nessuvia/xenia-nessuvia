import assert from 'node:assert'
import { drawNarrationWindow, previewShape, textSeed } from './styleDraw.ts'
import { defaultFlowStyle } from './flowRules.ts'

const style = { ...defaultFlowStyle, narrationRatio: [0.2, 0.4] as [number, number] }

// Noise 0 is the range as set; a missing noise (older stacks) is 0.
assert.deepEqual(drawNarrationWindow({ ...style, noise: 0 }, 5), [0.2, 0.4])
assert.deepEqual(drawNarrationWindow({ ...style, noise: undefined as unknown as number }, 5), [0.2, 0.4])

// The same text draws the same window; the width holds; the slide stays within noise times the width.
const seed = textSeed('He sat down on the mat.')
assert.equal(seed, textSeed('He sat down on the mat.'))
assert.notEqual(seed, textSeed('He sat down on the rug.'))
const windows = Array.from({ length: 200 }, (_, i) => drawNarrationWindow({ ...style, noise: 0.5 }, i))
for (const [lo, hi] of windows) {
  assert.ok(Math.abs(hi - lo - 0.2) < 1e-9)
  assert.ok(lo >= 0.2 - 0.1 - 1e-9 && lo <= 0.2 + 0.1 + 1e-9)
}
assert.ok(new Set(windows.map(([lo]) => lo.toFixed(3))).size > 50, 'noise should vary the window')
// Clamped to 0..1.
assert.ok(drawNarrationWindow({ ...style, narrationRatio: [0, 0.05], noise: 1 }, 3)[0] >= 0)

// The preview draws the pass's window and fills paragraphs to about the drawn ratio.
const preview = previewShape({ ...style, noise: 0.5 }, 42)
assert.deepEqual(preview.window, drawNarrationWindow({ ...style, noise: 0.5 }, 42))
assert.ok(preview.ratio >= preview.window[0] && preview.ratio <= preview.window[1])
const narration = preview.shape.reduce((n, p) => n + p.narration, 0)
const total = preview.shape.reduce((n, p) => n + p.narration + p.dialogue, 0)
assert.equal(total, 120)
assert.ok(Math.abs(narration / total - preview.ratio) < 0.12)
