import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { exportPresets, parsePresetFile } from './presetJson.ts'

// The bundled file, read rather than imported: node's JSON import needs an attribute Vite doesn't
// want, and `bundledPreset.ts` uses the Vite form.
const bundled = parsePresetFile(
  readFileSync(new URL('./bundled/starterPreset.json', import.meta.url), 'utf8'),
)
// Exactly one, on purpose. A second bundled preset is the thing the plan says not to ship.
assert.equal(bundled.length, 1, 'the bundled file should hold one preset')
assert.ok(bundled[0].label.trim(), 'the bundled preset has no label')
assert.ok(bundled[0].text.length > 100, 'the bundled preset text looks too short to be the example')

// Round trip: ids are reissued on the way in, label and text survive.
const back = parsePresetFile(exportPresets(bundled))
assert.equal(back.length, bundled.length)
assert.deepEqual(
  back.map((p) => ({ label: p.label, text: p.text })),
  bundled.map((p) => ({ label: p.label, text: p.text })),
)
assert.ok(back.every((p, i) => p.id !== bundled[i].id))
assert.ok(back.every((p) => p.id.length > 8))

// A bare array and a single object are both accepted.
assert.equal(parsePresetFile('[{"text":"a"},{"text":"b"}]').length, 2)
assert.equal(parsePresetFile('{"text":"just the one"}').length, 1)

// A preset with no label gets a positional one rather than an empty row in the list.
assert.equal(parsePresetFile('[{"text":"a"},{"text":"b"}]')[1].label, 'Preset 2')
assert.equal(parsePresetFile('[{"label":"  Voice  ","text":"a"}]')[0].label, 'Voice')

// Rejections, each naming the position, and each rejecting the whole file rather than importing
// the good half: a partial import of a two-preset file is the failure that looks like success.
assert.throws(() => parsePresetFile('not json'), /Not JSON/)
assert.throws(() => parsePresetFile('[{"text":"ok"},{"text":"   "}]'), /Preset 2 has no text/)
assert.throws(() => parsePresetFile('[{"text":"ok"},"nope"]'), /Preset 2 is not an object/)
assert.throws(() => parsePresetFile('[{"text":"ok"},{"label":"x"}]'), /Preset 2 has no text/)
assert.throws(() => parsePresetFile('[]'), /No presets/)
assert.throws(() => parsePresetFile('{"presets":[]}'), /No presets/)
assert.throws(() => parsePresetFile('{"presets":"no"}'), /"presets" is not a list/)

console.log('checkPresetJson ok')
