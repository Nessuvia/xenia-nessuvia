import assert from 'node:assert'
import { decideRewrite, defaultQuality, verdictSummary } from './decide.ts'
import type { ScoreContext } from './score.ts'
import { buildCensus, defaultCensus } from './census.ts'
import type { LexiconEntry } from './lexicon.ts'

// A fixture lexicon, not a shipped one: nothing ships a slop list any more, so a check that needs
// one writes the two entries it is asserting about.
const lexicon: LexiconEntry[] = [
  { id: 'shiver-spine', phrase: 'a shiver (ran|runs) down .{0,12}spine', regex: true, enabled: true, weight: 3 },
  { id: 'swallowed-hard', phrase: 'swallowed hard', regex: false, enabled: true, weight: 2 },
]

const ctx: ScoreContext = {
  census: buildCensus([], defaultCensus),
  lexicon,
  rules: [],
  role: 'assistant',
}
const settings = { ...defaultQuality }

// The first paragraph carries stock phrasing a rewrite can fix; the second is already clean, which
// is the case a rewrite is most likely to spoil.
const p1 = 'A shiver ran down her spine as she set the cup down and waited for him to speak.'
const p2 = 'The rain had stopped an hour ago and neither of them had mentioned it once.'
const original = `${p1}\n\n${p2}`

const improved = 'Her hands were not steady as she set the cup down and waited for him to speak.'
const spoiled = 'The air was thick with tension, and neither of them had mentioned the rain once.'

// A rewrite that is no better in either paragraph changes nothing at all.
const worse = decideRewrite(original, `${p1}\n\n${spoiled}`, ctx, settings)
assert.equal(worse.changed, 0)
assert.equal(worse.text, original, 'the original comes back byte for byte')
assert.ok(worse.decisions.every((d) => d.kept === 'original'))

// A rewrite that improves one paragraph and spoils the other keeps one of each.
const mixed = decideRewrite(original, `${improved}\n\n${spoiled}`, ctx, settings)
assert.equal(mixed.changed, 1)
assert.ok(mixed.text.includes(improved), 'the better paragraph is taken')
assert.ok(mixed.text.includes(p2), 'the spoiled paragraph keeps its original')
assert.equal(mixed.decisions.length, 2)
assert.equal(mixed.decisions[1].kept, 'original')
assert.match(mixed.decisions[1].reason!, /score better/)

// An invariant violation in one chunk does not cost the other chunk.
const invented = decideRewrite(
  original,
  `Marcus set the cup down and waited a long moment for him to speak at last.\n\n${p2}`,
  ctx,
  settings,
)
assert.equal(invented.decisions[0].kept, 'original')
assert.match(invented.decisions[0].reason!, /Marcus/)
assert.ok(invented.text.startsWith(p1))

// A dropped paragraph keeps its original rather than vanishing from the message.
const dropped = decideRewrite(original, improved, ctx, settings)
assert.ok(dropped.text.includes(p2), 'a paragraph the rewrite never answered survives')

// Paragraph separators come from the original, whatever the rewrite did with whitespace.
const spaced = decideRewrite(original, `${improved}\n\n\n\n${p2}`, ctx, settings)
assert.ok(!spaced.text.includes('\n\n\n'), 'the original separator is used')

// A tie keeps the original: the incumbent is what the user already read.
assert.equal(decideRewrite(original, original, ctx, settings).changed, 0)

// minImprovement raises the bar: a rewrite that wins by a little no longer wins.
const strict = { ...settings, minImprovement: 100 }
assert.equal(decideRewrite(original, `${improved}\n\n${p2}`, ctx, strict).changed, 0)

// Disabled, the verdict is the rewrite untouched, which is how a rewrite stage behaves with no score stage after it.
const off = decideRewrite(original, 'anything at all', ctx, { ...settings, enabled: false })
assert.equal(off.text, 'anything at all')

// Degenerate input returns the original rather than throwing.
assert.equal(decideRewrite('', 'something', ctx, settings).text, '')
assert.doesNotThrow(() => decideRewrite(original, '', ctx, settings))

// The summary says what happened, in one line.
assert.match(verdictSummary(mixed), /1 of 2/)
assert.match(verdictSummary(worse), /Changed nothing/)
assert.equal(verdictSummary({ text: '', decisions: [], changed: 0 }), '')

console.log('checkDecide ok')
