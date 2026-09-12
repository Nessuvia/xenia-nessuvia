// Run: node --experimental-strip-types src/core/games/checkParseMove.ts
import assert from 'node:assert'
import type { Rank } from './deck.ts'
import { parseAction, parseAsk } from './parseMove.ts'

const legal: Rank[] = ['3', '7', 'J', 'Q', '10', 'A']

// --- the shapes a player actually types -----------------------------------
assert.strictEqual(parseAsk('got any sevens', legal), '7')
assert.strictEqual(parseAsk('any 3s?', legal), '3')
assert.strictEqual(parseAsk('threes', legal), '3')
assert.strictEqual(parseAsk('Do you have any QUEENS?', legal), 'Q')
assert.strictEqual(parseAsk('  jack  ', legal), 'J')
assert.strictEqual(parseAsk('10', legal), '10')
assert.strictEqual(parseAsk('any tens', legal), '10')
assert.strictEqual(parseAsk('q', legal), 'Q')

// A bare letter is read only when nothing spelled out matched: the article in "got a jack"
// does not turn into an ace.
assert.strictEqual(parseAsk('got a jack?', legal), 'J')
assert.strictEqual(parseAsk('a', legal), 'A')
assert.strictEqual(parseAsk('aces please', legal), 'A')

// --- null is the toast ----------------------------------------------------
assert.strictEqual(parseAsk('', legal), null)
assert.strictEqual(parseAsk('what is happening', legal), null)
assert.strictEqual(parseAsk('threes or fours', legal), null, 'two ranks is ambiguous')
assert.strictEqual(parseAsk('kings', legal), null, 'a rank you do not hold is not a move')
assert.strictEqual(parseAsk('5', legal), null)
assert.strictEqual(parseAsk('any', legal), null)

// --- blackjack's two decisions -------------------------------------------
assert.strictEqual(parseAction('hit me'), 'hit')
assert.strictEqual(parseAction('another'), 'hit')
assert.strictEqual(parseAction('twist'), 'hit')
assert.strictEqual(parseAction('stand'), 'stand')
assert.strictEqual(parseAction("I'll stick"), 'stand')
assert.strictEqual(parseAction('no thanks'), 'stand')
assert.strictEqual(parseAction(''), null)
assert.strictEqual(parseAction('what are the odds here'), null)
assert.strictEqual(parseAction('hit or stand, I cannot decide'), null, 'both is not a decision')

console.log('ok')
