import assert from 'node:assert/strict'
import { CompromiseTagger, tagsToPos, wordTokens, type Token } from './tagger.ts'

const tagger = new CompromiseTagger()

function tok(tokens: Token[], i: number) {
  const t = tokens[i]
  return t ? { text: t.text, pos: t.pos.join(','), start: t.start, end: t.end } : null
}

// Basic tagging: each word lands in its expected slot, and the full stop is a token of its own.
const a = tagger.tokenize('The quick brown fox jumps swiftly.')
assert.equal(a.length, 7)
assert.deepEqual(tok(a, 6), { text: '.', pos: 'punct', start: 33, end: 34 })
assert.deepEqual(wordTokens(a).map((t) => t.text), ['The', 'quick', 'brown', 'fox', 'jumps', 'swiftly'])
assert.deepEqual(tok(a, 0), { text: 'The', pos: 'det', start: 0, end: 3 })
assert.deepEqual(tok(a, 1), { text: 'quick', pos: 'adj', start: 4, end: 9 })
assert.deepEqual(tok(a, 3), { text: 'fox', pos: 'noun', start: 16, end: 19 })
assert.deepEqual(tok(a, 4), { text: 'jumps', pos: 'verb', start: 20, end: 25 })
assert.deepEqual(tok(a, 5), { text: 'swiftly', pos: 'adv', start: 26, end: 33 })

// Sentence boundaries: two sentences get distinct indices; offsets are continuous.
const b = wordTokens(tagger.tokenize('She runs with a graceful elegance. He waits.'))
assert.equal(b.length, 8)
// "She runs with a graceful elegance." is sentence 0; "He waits." is sentence 1.
assert.equal(b[0].sentenceIndex, 0) // She
assert.equal(b[5].sentenceIndex, 0) // elegance
assert.equal(b[6].sentenceIndex, 1) // He
assert.equal(b[7].sentenceIndex, 1) // waits
// "with" is a preposition, "a" a determiner, "elegance" a noun.
assert.deepEqual(tok(b, 2), { text: 'with', pos: 'prep', start: 9, end: 13 })
assert.deepEqual(tok(b, 3), { text: 'a', pos: 'det', start: 14, end: 15 })
assert.deepEqual(tok(b, 6), { text: 'He', pos: 'noun,pron', start: 35, end: 37 })
assert.deepEqual(tok(b, 7), { text: 'waits', pos: 'verb', start: 38, end: 43 })

// The stop closing a sentence belongs to that sentence, not to the one it precedes.
const bp = tagger.tokenize('She runs with a graceful elegance. He waits.')
const stop = bp.find((t) => t.text === '.')!
assert.equal(stop.sentenceIndex, 0)

// tagsToPos dedupes and ignores unknown tags.
assert.deepEqual(tagsToPos(['Noun', 'Singular', 'Singular']), ['noun'])
assert.deepEqual(tagsToPos(['Conjunction']), ['conj'])
assert.deepEqual(tagsToPos(['Verb', 'PastTense']), ['verb'])
assert.deepEqual(tagsToPos(['QuestionMark']), [])

// Empty string is a clean empty, not a throw.
assert.deepEqual(tagger.tokenize(''), [])

// Punctuation gets its own token, at its own offsets; the words around it are unaffected.
const c = tagger.tokenize('Hello, world!')
assert.deepEqual(c.map((t) => t.text), ['Hello', ',', 'world', '!'])
// "Hello" has no POS slot (interjection); it survives because it has word characters.
assert.deepEqual(tok(c, 0), { text: 'Hello', pos: '', start: 0, end: 5 })
assert.deepEqual(tok(c, 1), { text: ',', pos: 'punct', start: 5, end: 6 })
assert.deepEqual(tok(c, 2), { text: 'world', pos: 'noun', start: 7, end: 12 })
assert.deepEqual(tok(c, 3), { text: '!', pos: 'punct', start: 12, end: 13 })

// A contraction is two tokens over one span. The leading half keeps its surface for display and
// carries the implicit word for matching.
const d = tagger.tokenize("She didn't smile.")
const [did, not] = d.filter((t) => t.contraction)
assert.equal(did.text, "didn't")
assert.equal(did.word, 'did')
assert.equal(did.contraction, 'head')
assert.equal(not.text, 'not')
assert.equal(not.contraction, 'tail')
assert.equal(not.start, did.start)
assert.equal(not.end, did.end)
// wordTokens puts the old stream back: one token per written word, no marks.
assert.deepEqual(wordTokens(d).map((t) => t.text), ['She', "didn't", 'smile'])

console.log('checkTagger OK')
