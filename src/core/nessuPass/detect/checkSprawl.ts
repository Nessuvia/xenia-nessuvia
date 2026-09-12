// Run: node --experimental-strip-types src/core/secondPass/checkSprawl.ts
import assert from 'node:assert/strict'
import { findSprawl } from './sprawl.ts'
import type { SprawlSettings } from '../stores/settingsStore.ts'

const on: SprawlSettings = { enabled: true, maxWords: 45, maxCommas: 4, maxConjunctions: 3 }
const set = (over: Partial<SprawlSettings> = {}): SprawlSettings => ({ ...on, ...over })

// The sample this check was written from: paratactic dialogue that passes every other rule in the
// bundle. No em dashes, no negative parallelism, no transitions, no flagged vocabulary.
const sprawling =
  "I was underneath it, right, and I mean underneath it, like pressed flat, the whole weight just " +
  "bearing down on me, and the thing about being pinned like that is you can't move at all, " +
  "everything's just squeezing, and it's so hot, you're just drenched."

// --- the sample is caught -------------------------------------------------
{
  const notes = findSprawl(sprawling, on)
  assert.equal(notes.length, 1, `expected one note, got ${notes.length}`)
  // The span indexes the text handed in, so the prompt can quote the sentence back.
  assert.equal(sprawling.slice(notes[0].span!.start, notes[0].span!.end), notes[0].slice)
  assert.equal(notes[0].source, 'sprawl')
  // The message names what actually tripped, so the model is not guessing at what to fix.
  assert.ok(/8 commas/.test(notes[0].message), notes[0].message)
  assert.ok(/4 coordinating conjunctions/.test(notes[0].message), notes[0].message)

  // Worth pinning: this sentence is exactly 45 words, so the word cap does not fire on it. Length
  // is the weak signal here and the joint counts are the strong one. Lowering maxWords far enough
  // to catch it by length would start flagging well-built long sentences.
  assert.ok(!/\d+ words/.test(notes[0].message), notes[0].message)
  assert.equal(findSprawl(sprawling, set({ maxCommas: 99, maxConjunctions: 99 })).length, 0)
}

// --- the same tic in narration ---------------------------------------------
{
  const narration =
    'He would remember this later, in the greenhouse, alone among his seedlings, and repeat every ' +
    "word to himself in the exact order she'd said them, and he would not know why he did this, " +
    'and he would not stop.'
  assert.equal(findSprawl(narration, on).length, 1, 'narration sprawls the same way dialogue does')
}

// --- long but well-built prose is left alone -------------------------------
{
  // 26 words, two commas, one "and". Long sentences are not the problem; unsubordinated chains are.
  const good =
    'A dark bruise had bloomed across the outside of her thigh, purpling at the center, green at ' +
    'the edges where the vine had cinched and dragged.'
  assert.equal(findSprawl(good, on).length, 0, 'a well-built long sentence should pass')

  // Ordinary narration, nowhere near any threshold.
  assert.equal(findSprawl('Chief was already reaching into his satchel.', on).length, 0)
  assert.equal(findSprawl('He was staring into the fire. His lips had stopped moving.', on).length, 0)
}

// --- short sentences never trip, however punctuated ------------------------
{
  // Clipped dialogue is full of commas and conjunctions and is not sprawl.
  assert.equal(findSprawl('No, wait, stop, and listen, and think.', on).length, 0)
}

// --- each threshold does something on its own ------------------------------
{
  // Commas alone: over the twenty-word floor, under the word cap, over the comma cap.
  const commas =
    'She moved across the room, and she turned, and she waited by the door, and she looked back ' +
    'once, and she left without saying anything at all.'
  assert.ok(findSprawl(commas, on).length > 0)
  assert.equal(findSprawl(commas, set({ maxCommas: 99, maxConjunctions: 99 })).length, 0)

  // Words alone: a long sentence with light punctuation still reports.
  const long = `She ${'walked on '.repeat(25)}home.`
  assert.ok(findSprawl(long, on).length > 0)
  assert.equal(findSprawl(long, set({ maxWords: 500 })).length, 0)

  // Raising every cap silences it, which is what the settings are for.
  assert.equal(findSprawl(sprawling, set({ maxWords: 500, maxCommas: 99, maxConjunctions: 99 })).length, 0)
}

// --- gating and clamping ---------------------------------------------------
{
  assert.equal(findSprawl(sprawling, set({ enabled: false })).length, 0)
  assert.equal(findSprawl('', on).length, 0)
  // Nonsense settings clamp rather than throw or match everything.
  assert.doesNotThrow(() => findSprawl(sprawling, set({ maxWords: 0, maxCommas: 0, maxConjunctions: 0 })))
}

// --- a wall of sprawl is still one problem ---------------------------------
{
  const many = Array(10).fill(sprawling).join(' ')
  assert.ok(findSprawl(many, on).length <= 4, 'notes should be capped')
}

console.log('checkSprawl OK')
