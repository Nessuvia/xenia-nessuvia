import assert from 'node:assert'
import { lengthGuard } from './lengthGuard.ts'

const band = { minRatio: 0.6, maxRatio: 2.0 }
const original = 'x'.repeat(100)

// In band, at both edges and in the middle.
assert.equal(lengthGuard(original, 'x'.repeat(100), band), null)
assert.equal(lengthGuard(original, 'x'.repeat(60), band), null)
assert.equal(lengthGuard(original, 'x'.repeat(200), band), null)

// Empty, and whitespace-only, which is the same failure with a different shape.
assert.match(lengthGuard(original, '', band)!, /empty/)
assert.match(lengthGuard(original, '   \n\n ', band)!, /empty/)

// Truncation and rambling, each naming its own side of the band.
assert.match(lengthGuard(original, 'x'.repeat(30), band)!, /30%.*60%/)
assert.match(lengthGuard(original, 'x'.repeat(400), band)!, /400%.*200%/)

// Surrounding whitespace is not length: this rewrite is the same text as the original.
assert.equal(lengthGuard(`  ${original}  `, `\n${original}\n`, band), null)

// A zero-length original divides by nothing. Accepted rather than rejected: there was no reply
// worth protecting, and Infinity% would reject every rewrite of it.
assert.equal(lengthGuard('', 'a real rewrite', band), null)
assert.equal(lengthGuard('   ', 'a real rewrite', band), null)
assert.match(lengthGuard('', '', band)!, /empty/)

// A band that accepts anything still rejects empty, and a band pinned to 1 accepts only an
// exact-length rewrite.
assert.equal(lengthGuard(original, 'x', { minRatio: 0, maxRatio: 1000 }), null)
assert.equal(lengthGuard(original, 'y'.repeat(100), { minRatio: 1, maxRatio: 1 }), null)
assert.ok(lengthGuard(original, 'y'.repeat(99), { minRatio: 1, maxRatio: 1 }))

console.log('checkLengthGuard ok')
