import assert from 'node:assert/strict'
import { stripText, stripWith, findFlags } from './strip.ts'
import type { GrammarHammerRule } from './rule.ts'
import { CompromiseTagger } from './tagger.ts'

const tagger = new CompromiseTagger()

function rule(pattern: string, opts: Partial<GrammarHammerRule> = {}): GrammarHammerRule {
  return {
    id: pattern,
    enabled: true,
    pattern,
    action: 'strip',
    scope: 'assistant',
    caseSensitive: false,
    ...opts,
  }
}

// "with a [adj] [noun]" strips "with a graceful elegance" from the sentence.
const r1 = rule('with a [adj] [noun]')
const s1 = stripWith('She runs with a graceful elegance.', [r1], 'assistant', tagger)
assert.equal(s1.text, 'She runs.', JSON.stringify(s1.text))
assert.ok(s1.removed.length >= 1, 'expected at least one removed span')
// The preview variant keeps the removed slice visible.
import { previewStrips } from './strip.ts'
const pv = previewStrips('She runs with a graceful elegance.', [r1], 'assistant', tagger)
assert.equal(pv.removed.length, 1)
assert.ok(pv.removed[0].slice.includes('graceful'))

// Preview strikes the orphan space repair would remove, so an end-of-sentence match doesn't leave
// a visible gap before the period. The struck slice grows to include the leading space.
const pvEnd = previewStrips('He took the glass with a practiced hand.', [r1], 'assistant', tagger)
assert.equal(pvEnd.removed.length, 1)
assert.equal(pvEnd.removed[0].slice, ' with a practiced hand')
assert.equal(pvEnd.text[pvEnd.removed[0].end], '.')

// Scope filtering: a user-scoped rule does not touch assistant text.
const rUser = rule('[adv] [adj]', { scope: 'user' })
const sScope = stripWith('She runs very quickly.', [rUser], 'assistant', tagger)
assert.equal(sScope.text, 'She runs very quickly.')
assert.equal(sScope.removed.length, 0)

// Disabled rule is skipped.
const rOff = rule('[adv]', { enabled: false })
const sOff = stripWith('She runs very quickly.', [rOff], 'assistant', tagger)
assert.equal(sOff.text, 'She runs very quickly.')

// Invalid pattern is skipped silently (the panel surfaces the error).
const rBad = rule('[notapos]')
const sBad = stripWith('She runs fast.', [rBad], 'assistant', tagger)
assert.equal(sBad.text, 'She runs fast.')

// Exclusion zone: inline code content is never tagged or matched, so `quick` survives even
// though it is an adjective. The bare `fast` outside is an adjective too and does strip.
const rAdj = rule('[adj]')
const fenced = stripWith('She runs `quick` fast.', [rAdj], 'assistant', tagger)
assert.ok(fenced.text.includes('quick'), 'inline code content should remain untouched')
assert.ok(!fenced.text.includes(' fast'), 'the bare adjective outside should strip')

// Replace action: crop the match to a capture group instead of deleting it. Pattern tokens are
// with(1) a(2) [adj](3) [noun](4); "$4" keeps only the noun.
const rRep = rule('with a [adj] [noun]', { action: 'replace', replacement: '$4' })
const sRep = stripWith('She runs with a graceful elegance.', [rRep], 'assistant', tagger)
assert.equal(sRep.text, 'She runs elegance.', JSON.stringify(sRep.text))
// $0 echoes the whole match; a literal + ref mix composes.
const rRep0 = rule('with a [adj] [noun]', { action: 'replace', replacement: 'with $4' })
const sRep0 = stripWith('She runs with a graceful elegance.', [rRep0], 'assistant', tagger)
assert.equal(sRep0.text, 'She runs with elegance.', JSON.stringify(sRep0.text))
// Preview surfaces both the removed slice and the replacement.
const pvRep = previewStrips('She runs with a graceful elegance.', [rRep], 'assistant', tagger)
assert.equal(pvRep.removed.length, 1)
assert.equal(pvRep.removed[0].replacement, 'elegance')

// Property: stripped output never contains a double space or space-before-terminal-punct.
const samples = [
  'She runs with a graceful elegance.',
  'He spoke with a quiet intensity, and with a loud whisper.',
  'It was not just a test, but a real one.',
]
for (const sample of samples) {
  const { text } = stripWith(sample, [r1, rule('[adj] and [adj]'), rule('not just [noun], but [noun]')], 'assistant', tagger)
  assert.ok(!/ {2,}/.test(text), `double space in ${JSON.stringify(text)}`)
  assert.ok(!/ [.;:!?]/.test(text), `space before punct in ${JSON.stringify(text)}`)
}

// Property: original text is recoverable. stripText never mutates its input argument.
const original = 'She runs with a graceful elegance.'
stripWith(original, [r1], 'assistant', tagger)
assert.equal(original, 'She runs with a graceful elegance.')

// Default tagger path works (memoized).
const sDefault = stripText('She runs with a graceful elegance.', [r1], 'assistant')
assert.ok(sDefault.text.length < original.length)

// A `flag` rule reports its match and edits nothing, which is the whole point of the action: the
// text stays exactly as the model wrote it and the pass decides what to do about the span.
const rFlag = rule('[adv] [adj]', { action: 'flag' })
const flagSource = 'She runs very quickly and looks quietly furious.'
assert.equal(stripWith(flagSource, [rFlag], 'assistant', tagger).text, flagSource)
const flags = findFlags(flagSource, [rFlag], 'assistant', tagger)
assert.ok(flags.length >= 1, 'expected the flag rule to match')
// The span has to index the text handed in, since that is what the model gets shown.
assert.equal(flagSource.slice(flags[0].start, flags[0].end), flags[0].slice)
assert.equal(flags[0].rule.id, rFlag.id)

// Flags are sorted left to right even when several rules match, so notes read in reading order.
const flagsMulti = findFlags(flagSource, [rFlag, rule('[adj] and [adj]', { action: 'flag' })], 'assistant', tagger)
for (let i = 1; i < flagsMulti.length; i++) {
  assert.ok(flagsMulti[i].start >= flagsMulti[i - 1].start, 'flags out of order')
}

// Scope and the enabled toggle gate flags the same way they gate strips.
assert.equal(findFlags(flagSource, [rule('[adv] [adj]', { action: 'flag', scope: 'user' })], 'assistant', tagger).length, 0)
assert.equal(findFlags(flagSource, [rule('[adv] [adj]', { action: 'flag', enabled: false })], 'assistant', tagger).length, 0)

// A strip rule and a flag rule in one set: the strip applies, the flag does not become an edit.
const mixed = stripWith('She runs with a graceful elegance very quickly.', [r1, rFlag], 'assistant', tagger)
assert.ok(!mixed.text.includes('graceful'), 'strip rule should still cut')
assert.ok(mixed.text.includes('very quickly'), 'flag rule must not cut')

console.log('checkStrip OK')
