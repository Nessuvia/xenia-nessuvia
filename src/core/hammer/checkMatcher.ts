import assert from 'node:assert/strict'
import { compilePattern } from './pattern.ts'
import { findMatches, overlapsExclusion } from './matcher.ts'
import type { Token } from './tagger.ts'

// Build tokens by hand so the matcher is tested independently of the tagger.
function t(text: string, start: number, pos: string[], sentenceIndex: number): Token {
  return { text, start, end: start + text.length, pos: pos as Token['pos'], sentenceIndex }
}

const tokens: Token[] = [
  t('She', 0, ['pron', 'noun'], 0),
  t('runs', 4, ['verb'], 0),
  t('with', 9, ['prep'], 0),
  t('a', 14, ['det'], 0),
  t('graceful', 16, ['adj'], 0),
  t('elegance', 25, ['noun'], 0),
  t('He', 35, ['pron', 'noun'], 1),
  t('waits', 38, ['verb'], 1),
]

// Literal + POS slot: "with a [adj] [noun]" matches tokens 2..6 → chars 9..33.
const p1 = compilePattern('with a [adj] [noun]')
const m1 = findMatches(tokens, p1)
assert.equal(m1.length, 1)
assert.equal(m1[0].start, 9)
assert.equal(m1[0].end, 33)
assert.equal(m1[0].tokenFrom, 2)
assert.equal(m1[0].tokenTo, 6)

// Two literal POS pair: "[adj] and [adj]" needs an intervening "and" literal.
const pair = compilePattern('[pron] runs')
const m2 = findMatches(tokens, pair)
assert.equal(m2.length, 1)
assert.equal(m2[0].start, 0)
assert.equal(m2[0].end, 8)

// Sentence boundary: a pattern spanning sentence 0 and 1 must not match.
const cross = compilePattern('[noun] [verb] [pron]')
// tokens[5]=elegance(noun,s0), tokens[6]=He(pron,s1): would need a verb between, none exists,
// and even "[noun] [pron]" across the boundary must fail.
const crossPat = compilePattern('[noun] [pron]')
const m3 = findMatches(tokens, crossPat)
// "She"(pron) then "runs"(verb): not noun+pron. "elegance"(noun s0) + "He"(pron s1): crosses → no.
assert.equal(m3.length, 0)

// Quantifier [adj]+ greedy across two adjectives in a crafted sentence.
const qtokens: Token[] = [
  t('the', 0, ['det'], 0),
  t('big', 4, ['adj'], 0),
  t('red', 8, ['adj'], 0),
  t('car', 12, ['noun'], 0),
  t('drove', 16, ['verb'], 0),
]
const qpat = compilePattern('[adj]+ [noun]')
const mq = findMatches(qtokens, qpat)
assert.equal(mq.length, 1)
assert.equal(mq[0].tokenFrom, 1)
assert.equal(mq[0].tokenTo, 4) // big, red, car
assert.equal(mq[0].start, 4)
assert.equal(mq[0].end, 15)

// Backtracking: "[adj]+ [adj]" must yield one adj to the second slot when needed.
const bt = compilePattern('[adj]+ [adj]')
const mbt = findMatches(qtokens, bt)
assert.equal(mbt.length, 1)
assert.equal(mbt[0].tokenFrom, 1)
assert.equal(mbt[0].tokenTo, 3) // big, red

// Optional [adj]? greedily takes the adjective when present. "red car" matches from index 2.
const opt = compilePattern('[adj]? [noun]')
const mo = findMatches(qtokens, opt)
assert.equal(mo.length, 1)
assert.equal(mo[0].tokenFrom, 2)
assert.equal(mo[0].tokenTo, 4)

// Exclusion zones: covering "graceful" suppresses the "with a [adj] [noun]" match.
const excl: Array<[number, number]> = [[16, 24]]
const mExcl = findMatches(tokens, p1, excl)
assert.equal(mExcl.length, 0)

// overlapsExclusion: sorted ranges, binary search.
const ranges: Array<[number, number]> = [[0, 5], [10, 20], [30, 40]]
assert.equal(overlapsExclusion(2, 4, ranges), true) // inside first
assert.equal(overlapsExclusion(7, 9, ranges), false) // in gap
assert.equal(overlapsExclusion(12, 18, ranges), true) // overlaps second
assert.equal(overlapsExclusion(25, 28, ranges), false) // in gap
assert.equal(overlapsExclusion(35, 45, ranges), true) // overlaps third
assert.equal(overlapsExclusion(5, 10, ranges), false) // touching edges, not overlapping

// [word] wildcard: matches any token, including one with no POS slot at all.
const wordTokens: Token[] = [
  t('not', 0, ['adv'], 0),
  t('just', 4, ['adv'], 0),
  t('here', 9, [], 0),
  t('but', 15, ['conj'], 0),
  t('there', 19, [], 0),
]
const wild = compilePattern('not just [word], but [word]')
const mWild = findMatches(wordTokens, wild)
assert.equal(mWild.length, 1)
assert.equal(mWild[0].start, 0)
assert.equal(mWild[0].end, 24)
// The same pattern with [noun] does not match untagged words.
assert.equal(findMatches(wordTokens, compilePattern('not just [noun], but [noun]')).length, 0)
// Quantifiers work on the wildcard.
const mWild2 = findMatches(wordTokens, compilePattern('not [word]{2,}'))
assert.equal(mWild2.length, 1)
assert.equal(mWild2[0].tokenTo, 5)

console.log('checkMatcher OK')
