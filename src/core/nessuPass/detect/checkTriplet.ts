import assert from 'node:assert'
import { findTriplets } from './triplet.ts'

const on = { enabled: true }

/** The sentence that started this: a verbless inventory of exactly three set-dressing items. */
const inventory =
  'Landscape prints in plastic frames, a pamphlet rack by the door, two rows of chairs bolted to a beige wall.'
const found = findTriplets(inventory, on)
assert.equal(found.length, 1)
assert.equal(found[0].source, 'triplet')
assert.equal(found[0].slice, inventory)

// Off is off.
assert.deepEqual(findTriplets(inventory, { enabled: false }), [])

// The syndetic version counts the same: "and" before the last member does not make it four.
assert.equal(
  findTriplets('She was cold from the rain, tired past arguing, and out of cigarettes.', on).length,
  1,
)

// Two is a pair and four is a list that could keep going. Neither is the tell.
assert.deepEqual(findTriplets('A pamphlet rack by the door, two rows of bolted chairs.', on), [])
assert.deepEqual(
  findTriplets(
    'Prints in plastic frames, a pamphlet rack, two rows of chairs, a water cooler nobody used.',
    on,
  ),
  [],
)

// Dialogue. The commas are inside the quotes, so the sentence is one member and never counted.
assert.deepEqual(findTriplets('"No, wait, stop," she said to the closing door.', on), [])

// A short chain of beats is not a survey, whatever its comma count.
assert.deepEqual(findTriplets('She stood, turned, left.', on), [])

// Only the offending sentence is reported, and the span points back into the source.
const passage = `Dom dropped into the end seat. ${inventory} Three percent battery.`
const one = findTriplets(passage, on)
assert.equal(one.length, 1)
assert.equal(passage.slice(one[0].span!.start, one[0].span!.end), inventory)

console.log('checkTriplet ok')
