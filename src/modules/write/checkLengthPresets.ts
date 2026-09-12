// Run: node --experimental-strip-types src/modules/write/checkLengthPresets.ts
import assert from 'node:assert'
import { customPreset, lengthPresets, presetFor } from './lengthPresets.ts'

// Every preset is reachable from its own numbers. That keeps the dropdown honest after a
// reload: the choice is recomputed rather than remembered.
for (const p of lengthPresets) {
  assert.strictEqual(presetFor(p.targetWords, p.chapters), p.id)
}

// Editing either number drops to Custom, and both have to match for a preset to win.
const novel = lengthPresets.find((p) => p.id === 'novel')!
assert.strictEqual(presetFor(novel.targetWords + 1, novel.chapters), customPreset)
assert.strictEqual(presetFor(novel.targetWords, novel.chapters + 1), customPreset)
assert.strictEqual(presetFor(0, 0), customPreset)

// Ids are unique, and so are the number pairs: two presets that matched the same pair would make
// the dropdown pick one of them arbitrarily.
const ids = new Set(lengthPresets.map((p) => p.id))
assert.strictEqual(ids.size, lengthPresets.length)
const pairs = new Set(lengthPresets.map((p) => `${p.targetWords}/${p.chapters}`))
assert.strictEqual(pairs.size, lengthPresets.length)

// Every preset carries usable numbers, and they run shortest to longest.
let last = 0
for (const p of lengthPresets) {
  assert.ok(p.targetWords > 0 && p.chapters > 0, `${p.id} has no numbers`)
  assert.ok(p.targetWords > last, `${p.id} is not longer than the one before it`)
  last = p.targetWords
}

console.log('checkLengthPresets ok')
