// Run: node --experimental-strip-types src/core/secondPass/checkRepetition.ts
import assert from 'node:assert/strict'
import { findRepetition } from './repetition.ts'
import type { RepetitionSettings } from '../stores/settingsStore.ts'

const on: RepetitionSettings = { enabled: true, phrase: 4, repeats: 2, lookback: 8 }
const set = (over: Partial<RepetitionSettings> = {}): RepetitionSettings => ({ ...on, ...over })

const phrase = 'a mixture of fear and desire'
const history = [
  `She looked at him with ${phrase} in her eyes.`,
  `He felt ${phrase} rising in his chest.`,
]
const text = `Something like ${phrase} crossed her face.`

// --- the basic catch ------------------------------------------------------
{
  const notes = findRepetition(text, history, on)
  assert.ok(notes.length >= 1, 'expected the repeated phrase to be caught')
  const n = notes[0]
  // The span has to index the text handed in: the prompt quotes this slice back to the model.
  assert.equal(text.slice(n.span!.start, n.span!.end), n.slice)
  assert.ok(n.slice!.includes('mixture'), n.slice)
  assert.equal(n.source, 'repetition')

  // One note per stretch, not one per overlapping window.
  assert.ok(notes.length <= 2, `overlapping windows produced ${notes.length} notes`)
}

// --- normalisation --------------------------------------------------------
{
  // Casing and apostrophes must not hide a repeat, but the slice stays as the model wrote it.
  const cased = findRepetition('A MIXTURE OF FEAR AND DESIRE again.', history, on)
  assert.ok(cased.length >= 1, 'normalisation should survive casing')
  assert.ok(cased[0].slice!.startsWith('A MIXTURE'), cased[0].slice)
}

// --- the thresholds actually do something ---------------------------------
{
  // A phrase in only one earlier message is not yet a habit at repeats: 2.
  assert.equal(findRepetition(text, [history[0]], on).length, 0)
  // …but is at repeats: 1.
  assert.ok(findRepetition(text, [history[0]], set({ repeats: 1 })).length >= 1)

  // A longer required phrase stops matching a shorter shared run.
  assert.equal(findRepetition('fear and desire again', history, set({ phrase: 8 })).length, 0)

  // lookback trims to the most recent messages, so an old repeat ages out.
  const old = [...history, 'Nothing in common.', 'Still nothing.']
  assert.equal(findRepetition(text, old, set({ lookback: 2 })).length, 0)
  assert.ok(findRepetition(text, old, set({ lookback: 4 })).length >= 1)

  // Out-of-range values are clamped rather than throwing or matching everything.
  assert.doesNotThrow(() => findRepetition(text, history, set({ phrase: 0, repeats: 0, lookback: 0 })))
}

// --- the quiet cases ------------------------------------------------------
{
  assert.equal(findRepetition(text, history, set({ enabled: false })).length, 0)
  assert.equal(findRepetition(text, [], on).length, 0)
  // Text too short to contain a four-word phrase.
  assert.equal(findRepetition('Yes.', history, on).length, 0)
  // A reply that shares nothing is clean.
  assert.equal(findRepetition('He turned and walked out into the rain.', history, on).length, 0)
  // A phrase used twice inside one earlier message is still just that one message having it.
  assert.equal(findRepetition(text, [`${phrase}. And again, ${phrase}.`], on).length, 0)
}

console.log('checkRepetition OK')
