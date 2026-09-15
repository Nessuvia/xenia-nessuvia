import assert from 'node:assert/strict'
import { builderPatch, chipParts, chipRefs, chipsRegex, nextChip, sampleTokens, type Chip } from './builder.ts'
import { compilePattern } from '../hammer/pattern.ts'
import { findMatches } from '../hammer/matcher.ts'
import { CompromiseTagger } from '../hammer/tagger.ts'

const tagger = new CompromiseTagger()
const hits = (dsl: string, text: string) =>
  findMatches(tagger.tokenize(text), compilePattern(dsl)).map((m) => text.slice(m.start, m.end))

const sample = "She didn't smile, and he left."
const tokens = sampleTokens(sample)
// One chip per word and per mark. The contraction is one chip.
assert.deepEqual(tokens.map((t) => t.text), ['She', "didn't", 'smile', ',', 'and', 'he', 'left', '.'])

// All exact by default, punctuation ignored, and the sample matches its own rule.
const base = builderPatch(sample)
assert.equal(base.find, "She didn't smile and he left")
assert.deepEqual(hits(base.find, sample), ["She didn't smile, and he left"])

// A word cycles exact, word type, any, and back. The type starts at the tagged part of speech.
const smile = nextChip(tokens[2], base.chips![2])
assert.deepEqual(smile, { state: 'type', tag: 'verb' })
assert.equal(nextChip(tokens[2], smile).state, 'any')
assert.equal(nextChip(tokens[2], nextChip(tokens[2], smile)).state, 'exact')

const chips = base.chips!.map((c, i) => (i === 2 ? smile : c))
const typed = builderPatch(sample, chips)
assert.equal(typed.find, "She didn't [verb] and he left")
assert.deepEqual(hits(typed.find, "She didn't blink, and he left."), ["She didn't blink, and he left"])

// A mark toggles to required, and then it has to be there.
const comma = nextChip(tokens[3], chips[3])
assert.equal(comma.state, 'exact')
const required = builderPatch(sample, chips.map((c, i) => (i === 3 ? comma : c)))
assert.equal(required.find, "She didn't [verb] , and he left")
assert.deepEqual(hits(required.find, "She didn't blink and he left."), [])
assert.equal(nextChip(tokens[3], comma).state, 'ignored')

// A bracket can't be written in the DSL, so it never becomes required.
const bracket = sampleTokens('a [b]')[1]
assert.equal(bracket.text, '[')
assert.equal(nextChip(bracket, { state: 'ignored' }).state, 'ignored')

// Counts, and `$n` numbering skips ignored marks.
const counted: Chip[] = chips.map((c, i) => (i === 2 ? { state: 'any', count: 'clause' } : i === 6 ? { state: 'type', tag: 'verb', count: 'few' } : c))
assert.equal(builderPatch(sample, counted).find, "She didn't [clause] and he [verb]{1,4}")
assert.deepEqual(chipRefs(chipParts(tokens, counted)), [1, 2, 3, null, 4, 5, 6, null])

// A new sample resets the chips.
assert.deepEqual(builderPatch('He left.').chips, [{ state: 'exact' }, { state: 'exact' }, { state: 'ignored' }])

// Edit as regex keeps what the chips matched.
assert.ok(new RegExp(chipsRegex(tokens, base.chips!), 'i').test(sample))
assert.ok(new RegExp(chipsRegex(tokens, chips), 'i').test("She didn't blink, and he left."))
assert.ok(!new RegExp(chipsRegex(tokens, chips), 'i').test('She did smile, and he left.'))
