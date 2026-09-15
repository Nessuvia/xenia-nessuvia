import assert from 'node:assert'
import { fontFamilyOf, isFontId, trackerCssProblem } from './trackerCss.ts'

assert.equal(trackerCssProblem('.trackerBarFill { background: var(--accent); }'), '')
assert.equal(trackerCssProblem(''), '')
for (const bad of [
  '.a { background: url(https://x.test/a.png) }',
  '.a { background: URL ("x") }',
  '.a { background: image-set("a.png" 1x) }',
  '.a { background: cross-fade("a.png", "b.png") }',
  '@import "x.css";',
  '@font-face { font-family: x; }',
  '.a { background: u\\72l(x) }',
  '.a { position: fixed; inset: 0 }',
  'x'.repeat(20001),
]) {
  assert.ok(trackerCssProblem(bad), bad.slice(0, 40))
}

assert.ok(isFontId('roboto-slab'))
assert.ok(!isFontId('Roboto Slab'))
assert.ok(!isFontId('a/../b'))
assert.equal(fontFamilyOf('roboto-slab'), 'Roboto Slab')
