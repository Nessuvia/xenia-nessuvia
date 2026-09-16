import assert from 'node:assert'
import { arousalOf, loadVad, textVad, vadOf } from './vad.ts'

// Nothing answers before the chunk loads.
assert.equal(vadOf('scream'), undefined)
await loadVad()

// All three axes, in range, and stems fall back to the base form.
const scream = vadOf('scream')!
assert.ok(scream.a > 0.5 && scream.v < 0)
assert.deepEqual(vadOf('screamed'), scream)
assert.equal(arousalOf('scream'), scream.a)
assert.ok(vadOf('devotedness')!.v > 0.9)
assert.equal(vadOf('xyzzyq'), undefined)

// Text means: grief reads lower valence than a joke, and a text with no known words has none.
assert.ok(textVad('She wept at the funeral, grief and loss everywhere.')!.v < textVad('She laughed at the silly joke, happy and playful.')!.v)
assert.equal(textVad('xyzzyq qqq'), undefined)
