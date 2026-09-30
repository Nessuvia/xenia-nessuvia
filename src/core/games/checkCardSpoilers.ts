import assert from 'node:assert'
import { spoilerRanges } from './cardSpoilers.ts'

const hits = (text: string, secret: Parameters<typeof spoilerRanges>[1]) =>
  spoilerRanges(text, secret).map((r) => text.slice(r.start, r.end).trim())

assert.deepStrictEqual(hits('I drew a seven. Nice.', ['7']), ['I drew a seven.'])
assert.deepStrictEqual(hits('She smirks. "Two queens, darling." Your move.', ['Q']), ['"Two queens, darling."'])
assert.deepStrictEqual(hits('The 10 of hearts is mine', ['10']), ['The 10 of hearts is mine'])
assert.deepStrictEqual(hits('Got 7s for days.', ['7']), ['Got 7s for days.'])
assert.deepStrictEqual(hits('Seven years ago I learned this game.', ['7']), [])
assert.deepStrictEqual(hits('I drew a seven.', ['8']), [])
assert.deepStrictEqual(hits('I drew a seven.', []), [])
assert.deepStrictEqual(hits("Second six, so that's a new pair to work with. Your turn.", ['6']), ["Second six, so that's a new pair to work with."])
assert.deepStrictEqual(hits('The first six minutes were quiet.', ['6']), [])
