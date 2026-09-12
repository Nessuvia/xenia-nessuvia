import assert from 'node:assert'
import { scoreText, defaultWeights, countSelfRepeats, countCensusHits, varietyCredit } from './score.ts'
import type { ScoreContext } from './score.ts'
import { buildCensus, defaultCensus } from './census.ts'
import { bundledLexicon } from './bundledLexicon.ts'

// Settings as literals rather than importing the store: a check script must not pull zustand in.
const ctx: ScoreContext = {
  census: buildCensus([], defaultCensus),
  lexicon: bundledLexicon,
  rules: [],
  role: 'assistant',
  sprawl: { enabled: true, maxWords: 45, maxCommas: 4, maxConjunctions: 3 },
  triplet: { enabled: true },
}

// The same passage, once with a stock phrase and once without. The slop part decides it.
const clean = 'She set the cup down. The rain had stopped an hour ago and neither of them had said so.'
const slopped = 'She set the cup down. A shiver ran down her spine and neither of them had said so.'
const cleanScore = scoreText(clean, ctx)
const sloppedScore = scoreText(slopped, ctx)
assert.ok(sloppedScore.total > cleanScore.total, 'stock phrasing should score worse')
assert.ok(sloppedScore.parts.slop > 0 && cleanScore.parts.slop === 0)

// Zeroing a weight turns that signal off entirely.
const off = { ...defaultWeights, slop: 0 }
assert.ok(
  Math.abs(scoreText(slopped, ctx, off).total - scoreText(clean, ctx, off).total) < 0.5,
  'with the slop weight at 0 the two passages should be near-indistinguishable',
)
assert.ok(scoreText(slopped, ctx, off).parts.slop > 0, 'the part is still measured, just not counted')

// The census is chat-specific: the same text scores worse in a chat that has worn the phrase out.
const worn = ['He waited by the window again.', 'She waited by the window again.', 'They waited by the window again.']
const withCensus: ScoreContext = { ...ctx, census: buildCensus(worn, defaultCensus) }
const line = 'Nothing else moved. She waited by the window again, and the light went.'
assert.ok(scoreText(line, withCensus).total > scoreText(line, ctx).total, 'a worn phrase should cost in this chat')
assert.equal(scoreText(line, ctx).parts.census, 0)

// Self-repetition is counted on 4-grams, per extra occurrence.
assert.equal(countSelfRepeats('one two three four and one two three four'), 1)
assert.equal(countSelfRepeats('one two three four five six seven eight'), 0)
assert.ok(scoreText('He walked to the door. He walked to the door. He walked to the door.', ctx).parts.selfRepeat > 0)

// Census hits are counted once per span, not once per window inside it.
const census = buildCensus(worn, defaultCensus)
assert.equal(countCensusHits('She waited by the window again.', census), 1)
assert.equal(countCensusHits('Nothing here at all.', census), 0)

// Variety is a credit: varied sentence lengths lower the total, flat ones do not.
const flat = 'He stood up slow. She sat back down. They both looked away. The clock kept going. Nobody said it.'
const varied = 'He stood. She sat back down and watched the door for a long moment without saying anything at all. Nobody said it.'
assert.ok(varietyCredit(varied) > varietyCredit(flat))
assert.ok(varietyCredit('One sentence only.') === 0, 'too few sentences to measure')
assert.ok(varietyCredit(flat) >= 0 && varietyCredit(varied) <= 1, 'the credit stays in range')

// Parts are per 100 words, so one stock phrase costs less in a long passage than in a short one.
const filler = ' The window stayed shut and the kettle went cold on the ring.'.repeat(6)
assert.ok(scoreText(slopped, ctx).parts.slop > scoreText(slopped + filler, ctx).parts.slop)

// Repeating a passage verbatim is a real fault, and the score says so.
assert.ok(scoreText(`${clean} ${clean}`, ctx).total > cleanScore.total)

// Degenerate input returns zero rather than dividing by nothing.
assert.equal(scoreText('', ctx).total, 0)
assert.equal(scoreText('   ', ctx).total, 0)
assert.equal(scoreText('Two words', ctx).total, 0)

// Every part is reported, so the panel can show why a chunk lost.
assert.deepEqual(
  Object.keys(sloppedScore.parts).sort(),
  ['census', 'flags', 'selfRepeat', 'slop', 'sprawl', 'triplet', 'variety'],
)

console.log('checkScore ok')
