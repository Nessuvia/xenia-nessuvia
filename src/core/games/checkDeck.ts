// Run: node --experimental-strip-types src/core/games/checkDeck.ts
import assert from 'node:assert'
import { cardTokens, fullDeck, isRed, rankPlural, ranks, shuffle, sortHand, suits } from './deck.ts'

// --- the deck is a deck ---------------------------------------------------
{
  const deck = fullDeck()
  assert.strictEqual(deck.length, 52)
  const keys = deck.map((c) => `${c.rank}${c.suit}`)
  assert.strictEqual(new Set(keys).size, 52, 'a card is duplicated')
  for (const rank of ranks) assert.strictEqual(deck.filter((c) => c.rank === rank).length, 4)
  for (const suit of suits) assert.strictEqual(deck.filter((c) => c.suit === suit).length, 13)
  assert.ok(isRed('H') && isRed('D') && !isRed('S') && !isRed('C'))
}

// --- a seeded shuffle is reproducible: that is what replay rests on ------
{
  const key = (seed: number) => shuffle(fullDeck(), seed).map((c) => `${c.rank}${c.suit}`).join(' ')
  assert.strictEqual(key(12345), key(12345), 'same seed gave a different deal')
  assert.notStrictEqual(key(12345), key(12346), 'two seeds gave the same deal')

  const source = fullDeck()
  const shuffled = shuffle(source, 7)
  assert.strictEqual(shuffled.length, 52)
  assert.deepStrictEqual(source, fullDeck(), 'shuffle mutated its input')
  assert.strictEqual(new Set(shuffled.map((c) => `${c.rank}${c.suit}`)).size, 52, 'shuffle lost a card')
  assert.notDeepStrictEqual(shuffled, source, 'shuffle did nothing')

  // Every seed has to produce a full deck: not just the one we happened to try.
  for (let seed = 0; seed < 50; seed++) {
    assert.strictEqual(new Set(shuffle(source, seed).map((c) => `${c.rank}${c.suit}`)).size, 52)
  }
}

// --- face-down cards get a name that gives nothing away -------------------
{
  const deck = fullDeck()
  const token = cardTokens(4242)
  const names = deck.map(token)
  assert.strictEqual(new Set(names).size, 52, 'two cards share a token')
  // Stable for the life of a game: the whole point is that a card keeps its name as it moves.
  assert.strictEqual(token(deck[0]), token({ ...deck[0] }))
  assert.strictEqual(cardTokens(4242)(deck[9]), names[9], 'same seed gave a different token')
  // A position in a seeded order, and nothing else: no rank, no suit, nothing to read off the DOM.
  for (const name of names) assert.match(name, /^c\d+$/)
  let differs = 0
  for (const [i, card] of deck.entries()) if (cardTokens(4243)(card) !== names[i]) differs++
  assert.ok(differs > 40, 'a different seed should name the deck differently')
}

// --- hand display ---------------------------------------------------------
{
  const hand = [
    { rank: 'K', suit: 'S' }, { rank: '3', suit: 'H' }, { rank: 'A', suit: 'D' }, { rank: '10', suit: 'C' },
  ] as const
  assert.deepStrictEqual(sortHand([...hand]).map((c) => c.rank), ['A', '3', '10', 'K'])
  assert.strictEqual(rankPlural('7'), 'sevens')
  assert.strictEqual(rankPlural('A'), 'aces')
  assert.strictEqual(rankPlural('10'), 'tens')
}

console.log('ok')
