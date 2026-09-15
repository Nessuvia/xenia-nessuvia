import assert from 'node:assert/strict'
import { exampleRegex, parseExampleRegex } from './example.ts'

const test = (find: string, slots: Record<number, 'one' | 'few' | 'clause'>, text: string) =>
  new RegExp(exampleRegex(find, slots), 'i').test(text)

// "not [anger] but [grief]"
const notBut = { 1: 'few', 3: 'few' } as const
assert.ok(test('not anger but grief', notBut, 'It was not a threat but a promise.'))
assert.ok(test('not anger but grief', notBut, 'not fear, but hope'))
assert.ok(!test('not anger but grief', notBut, 'nothing but hope'))

// Contractions both ways, and punctuation on fixed words is loose.
assert.ok(test('She did not cry.', { 0: 'one', 3: 'one' }, "He didn't scream"))
assert.ok(test("She didn't cry.", { 0: 'one', 2: 'one' }, 'He did not scream'))

// No slots: plain words, as before.
assert.ok(test('a testament to', {}, 'It was a testament to him.'))
assert.ok(!test('a testament to', {}, 'a testament of'))

// A clause slot stops at punctuation.
assert.ok(test('with deliberate slowness', { 1: 'clause', 2: 'clause' }, 'with great care, he stood'))
assert.equal(new RegExp(exampleRegex('with deliberate slowness', { 1: 'clause', 2: 'clause' })).exec('with great care, he stood')?.[0], 'with great care')

// Round trip, keeping the example's slot words.
const src = exampleRegex('not anger but grief', notBut)
assert.deepEqual(parseExampleRegex(src, { find: 'not anger but grief', slots: notBut }), { find: 'not anger but grief', slots: notBut })

// A hand edit that keeps the shape reflects: "but" becomes "yet".
assert.deepEqual(parseExampleRegex(src.replace('but', 'yet'), { find: 'not anger but grief', slots: notBut }), { find: 'not anger yet grief', slots: notBut })

// A slot size swapped by hand reflects too.
assert.deepEqual(parseExampleRegex(exampleRegex('not anger but grief', { 1: 'one', 3: 'few' }), { find: 'not anger but grief', slots: notBut }), { find: 'not anger but grief', slots: { 1: 'one', 3: 'few' } })

// Contractions read back as the long form.
assert.deepEqual(parseExampleRegex(exampleRegex("she didn't cry", {}), { find: '', slots: {} }), { find: 'she did not cry', slots: {} })

// Anything else unlinks.
assert.equal(parseExampleRegex('\\bnot (\\w+)\\b', { find: '', slots: {} }), null)
assert.equal(parseExampleRegex('not|anger', { find: '', slots: {} }), null)

// Punctuation on its own still matches.
assert.ok(test('!', {}, 'It shines!'))
