import assert from 'node:assert'
import { agentBeat, changedRanges, flashed, freshRuns, mergeMarks } from './stage.ts'

const slices = (after: string, before: string) => changedRanges(before, after).map(([s, e]) => after.slice(s, e))

assert.deepEqual(slices('I use the gem.', 'I utilize the gem.'), ['use'])
// A pure removal marks the word before the gap.
assert.deepEqual(slices('He nodded.', 'He nodded slowly, without looking.'), ['nodded.'])
assert.deepEqual(slices('He sat, then left.', 'He sat — then left.'), ['sat,'])
assert.deepEqual(changedRanges('same', 'same'), [])

assert.deepEqual(flashed('the gem', 2, [[0, 1], [6, 9]]), [
  { text: 'the ', mark: 'none' },
  { text: 'gem', mark: 'flash' },
])
assert.deepEqual(mergeMarks([{ text: 'a', mark: 'none' }, { text: '', mark: 'flash' }, { text: 'b', mark: 'none' }]), [{ text: 'ab', mark: 'none' }])

assert.equal(agentBeat(1), 600)
assert.equal(agentBeat(8), 250)
assert.equal(agentBeat(100), 150)

// Whole-reply steps mark only what changed as fresh.
assert.deepEqual(freshRuns('He sat. He looked.', 'He sat and looked.'), [
  { text: 'He ', mark: 'none' },
  { text: 'sat and', mark: 'fresh' },
  { text: ' looked.', mark: 'none' },
])
