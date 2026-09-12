import assert from 'node:assert'
import { buildCensus, defaultCensus, phrasesOf, proseSegments } from './census.ts'

const opts = { ...defaultCensus }

// A phrase used in three messages is overused; one used once is not.
const history = [
  'She looked at him with something unreadable in her eyes.',
  'The road was long. Something unreadable in her eyes, again.',
  'He said nothing. Something unreadable in her eyes, still.',
  'A sentence that appears exactly once and should stay unlisted.',
]
const census = buildCensus(history, opts)
assert.ok(census.has('something unreadable in her eyes'), 'the repeated phrase should be found')
assert.ok(!census.has('a sentence that appears exactly'), 'a one-off should not be')
assert.ok(census.entries.length > 0)
assert.ok(census.entries.every((e) => e.count >= 2))

// Absorption: the six-word phrase survives, its own substring does not appear as a separate entry
// with the same count.
const phrases = census.entries.map((e) => e.phrase)
assert.ok(phrases.includes('something unreadable in her eyes'))
assert.ok(!phrases.includes('unreadable in her eyes'), 'a covered substring should be absorbed')

// Code is not prose: a repeated fence never becomes a banned phrase.
const code = '```\nconst value = compute(x)\n```'
const fenced = buildCensus([code, code, code], opts)
assert.deepEqual(fenced.entries, [], 'excluded spans produce no entries')
assert.ok(proseSegments(code).every((s) => !s.includes('compute')))

// A phrase must not form across the hole an exclusion leaves.
assert.ok(!phrasesOf('one before `code` after two').some((p) => p.includes('before after')))

// Pure function words are grammar, not habit.
assert.ok(!phrasesOf('out of the').includes('out of the'))
assert.ok(phrasesOf('out of the room').includes('out of the room'))

// n-grams run 3 to 6 words, nothing shorter or longer.
const lengths = new Set(phrasesOf('one two three four five six seven eight').map((p) => p.split(' ').length))
assert.deepEqual([...lengths].sort(), [3, 4, 5, 6])

// Casing and apostrophes do not hide a repeat.
const cased = buildCensus(["Don't look at me", 'DONT LOOK AT ME'], opts)
assert.ok(cased.has('dont look at me'))

// Switches: disabled, a zero cap, and an empty history all produce nothing rather than throwing.
assert.deepEqual(buildCensus(history, { ...opts, enabled: false }).entries, [])
assert.deepEqual(buildCensus(history, { ...opts, maxEntries: 0 }).entries, [])
assert.deepEqual(buildCensus([], opts).entries, [])

// The cap is honoured, and the entries kept are the most-used ones.
const noisy = Array.from({ length: 30 }, (_, i) => `phrase number ${i} here. phrase number ${i} here.`)
const capped = buildCensus([...noisy, ...history], { ...opts, maxEntries: 3 })
assert.equal(capped.entries.length, 3)
assert.ok(capped.entries[0].count >= capped.entries[2].count)

// The window only looks at the tail, so an old habit the model has dropped stops being banned.
const old = buildCensus([...history, ...Array.from({ length: 20 }, () => 'A fresh unrelated line of prose.')], opts)
assert.ok(!old.has('something unreadable in her eyes'))

console.log('checkCensus ok')
