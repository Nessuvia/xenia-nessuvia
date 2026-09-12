// Cards and a seeded shuffle. Pure, no React, no storage: a stored seed has to reproduce the exact
// deal. That is what lets a game replay from its event log without storing card positions.

export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'
export type Suit = 'S' | 'H' | 'D' | 'C'

export interface Card {
  rank: Rank
  suit: Suit
}

export const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
export const suits: Suit[] = ['S', 'H', 'D', 'C']

/** Red suits render in --danger; the board asks this rather than testing suits itself. */
export function isRed(suit: Suit): boolean {
  return suit === 'H' || suit === 'D'
}

export function fullDeck(): Card[] {
  const deck: Card[] = []
  for (const rank of ranks) for (const suit of suits) deck.push({ rank, suit })
  return deck
}

/** mulberry32: eight lines, uniform enough for a card game, and identical in every browser. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates over a copy. Same seed, same order, forever. */
export function shuffle(deck: Card[], seed: number): Card[] {
  const out = deck.slice()
  const random = prng(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * An opaque, stable name for a card, for a hand nobody may see.
 *
 * A face-down card still needs an identity the motion pass can follow, or a card leaving the middle
 * of a hand animates as though the last one left. Its rank cannot be that identity: it would be in
 * the DOM, and a hand you may not see would be readable from the markup. This is the card's
 * position in a seeded shuffle of the deck. Stable for the life of a game, and meaningless
 * without the seed. The seed lives in the store and never reaches the page.
 */
export function cardTokens(seed: number): (card: Card) => string {
  const order = shuffle(fullDeck(), (seed ^ 0x9e3779b9) >>> 0)
  const tokens = new Map(order.map((card, i) => [`${card.rank}${card.suit}`, `c${i}`]))
  return (card) => tokens.get(`${card.rank}${card.suit}`) ?? 'c'
}

/** Sort ascending by rank: a pair in your hand reads at a glance. */
export function sortHand(hand: Card[]): Card[] {
  return hand.slice().sort((a, b) => ranks.indexOf(a.rank) - ranks.indexOf(b.rank))
}

/** How a rank is spoken: "sevens", "aces". Used by the event lines and the parser's word list. */
export function rankPlural(rank: Rank): string {
  const words: Record<Rank, string> = {
    A: 'aces', '2': 'twos', '3': 'threes', '4': 'fours', '5': 'fives', '6': 'sixes',
    '7': 'sevens', '8': 'eights', '9': 'nines', '10': 'tens', J: 'jacks', Q: 'queens', K: 'kings',
  }
  return words[rank]
}
