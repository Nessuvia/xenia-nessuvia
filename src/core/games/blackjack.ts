// Blackjack: the character deals, you play one hand a round, rounds run until the shoe is low.
//
// Same contract as Go Fish. Code owns every rule, the model is told what happened and writes a
// line, and state is only ever produced by folding the log from the seed. The dealer's draw is the
// book rule, not a decision: stand on 17, hit below it.

import type { Card, Rank } from './deck.ts'
import { fullDeck, shuffle } from './deck.ts'

export type Side = 'player' | 'char'

/** Cards dealt to each side at the start of a round. */
export const openingCards = 2
/** The dealer stops here. */
export const dealerStands = 17
/** Below this many cards left, the round that just finished is the last one. */
export const shoeFloor = 15

export type Outcome = 'player' | 'char' | 'push'

export type BlackjackEvent =
  /** Opens a round: two each, the dealer's second card face down. */
  | { kind: 'deal' }
  | { kind: 'hit'; by: Side; rank: Rank }
  | { kind: 'stand'; by: Side }
  | { kind: 'bust'; by: Side }
  /** The hole card turns over. Always before the dealer draws. */
  | { kind: 'reveal' }
  | { kind: 'settle'; outcome: Outcome }
  | { kind: 'end' }
  | { kind: 'say'; by: Side; text: string }

export interface BlackjackState {
  deck: Card[]
  hands: Record<Side, Card[]>
  /** The dealer's second card is face down until they play. */
  holeDown: boolean
  /** Rounds won by each side. A push moves neither. */
  score: Record<Side, number>
  /** Whose decision the table is waiting on. `null` between rounds and at the end. */
  turn: Side | null
  /** Rounds settled so far. */
  round: number
  /** The last round's result, or null before the first is settled. */
  outcome: Outcome | null
  over: boolean
}

/** A hand's best total, and whether an ace is still counting as eleven. */
export function handValue(hand: Card[]): { total: number; soft: boolean } {
  let total = 0
  let aces = 0
  for (const card of hand) {
    if (card.rank === 'A') {
      aces++
      total += 11
    } else if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J' || card.rank === '10') {
      total += 10
    } else {
      total += Number(card.rank)
    }
  }
  // Every ace that would bust the hand drops to one, one at a time.
  let soft = aces > 0
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
    soft = aces > 0
  }
  return { total, soft }
}

/** Twenty-one on the first two cards, which beats twenty-one on three. */
export function isBlackjack(hand: Card[]): boolean {
  return hand.length === openingCards && handValue(hand).total === 21
}

export function isBust(hand: Card[]): boolean {
  return handValue(hand).total > 21
}

/** What the player can see of the dealer's hand: the hole card is not in it. */
export function visibleHand(state: BlackjackState): Card[] {
  return state.holeDown ? state.hands.char.slice(0, 1) : state.hands.char
}

export function initialState(seed: number): BlackjackState {
  return {
    deck: shuffle(fullDeck(), seed),
    hands: { player: [], char: [] },
    holeDown: true,
    score: { player: 0, char: 0 },
    turn: null,
    round: 0,
    outcome: null,
    over: false,
  }
}

export function reduce(state: BlackjackState, event: BlackjackEvent): BlackjackState {
  switch (event.kind) {
    case 'deal': {
      const drawn = state.deck.slice(0, openingCards * 2)
      // Alternating, the way a table deals: player, dealer, player, dealer.
      const player = drawn.filter((_card, i) => i % 2 === 0)
      const char = drawn.filter((_card, i) => i % 2 === 1)
      return {
        ...state,
        deck: state.deck.slice(openingCards * 2),
        hands: { player, char },
        holeDown: true,
        turn: 'player',
        outcome: null,
      }
    }
    case 'hit': {
      const card = state.deck[0]
      if (!card) return state
      return {
        ...state,
        deck: state.deck.slice(1),
        hands: { ...state.hands, [event.by]: [...state.hands[event.by], card] },
      }
    }
    case 'stand':
      return { ...state, turn: event.by === 'player' ? 'char' : null }
    case 'bust':
      return { ...state, turn: event.by === 'player' ? 'char' : null }
    case 'reveal':
      return { ...state, holeDown: false, turn: 'char' }
    case 'settle':
      return {
        ...state,
        holeDown: false,
        turn: null,
        round: state.round + 1,
        outcome: event.outcome,
        score:
          event.outcome === 'push'
            ? state.score
            : { ...state.score, [event.outcome]: state.score[event.outcome] + 1 },
      }
    case 'end':
      return { ...state, over: true, turn: null }
    case 'say':
      return state
  }
}

export function replay(seed: number, events: BlackjackEvent[], upTo?: number): BlackjackState {
  const slice = upTo === undefined ? events : events.slice(0, upTo)
  return slice.reduce(reduce, initialState(seed))
}

export type Action = 'hit' | 'stand'

/**
 * What the player may do right now. Empty between rounds and once the game is over.
 *
 * A hand of 21 is not a decision: `resolveAction` stands it for them, and the turn is already
 * the dealer's by the time this is asked again. The bust check is the same story.
 */
export function legalActions(state: BlackjackState): Action[] {
  if (state.over || state.turn !== 'player') return []
  if (isBust(state.hands.player)) return []
  return ['hit', 'stand']
}

/** Open a round. Separate from `resolveAction`: nobody chooses to be dealt to. */
export function dealRound(state: BlackjackState): BlackjackEvent[] {
  const events: BlackjackEvent[] = []
  let current = state
  const emit = (event: BlackjackEvent) => {
    events.push(event)
    current = reduce(current, event)
  }
  emit({ kind: 'deal' })
  // Two blackjacks push, one wins on the spot. Neither side gets a decision either way.
  if (isBlackjack(current.hands.player) || isBlackjack(current.hands.char)) {
    emit({ kind: 'reveal' })
    events.push(...settle(current))
  }
  return events
}

/**
 * The consequence of the player's own decision, and nothing past it. Every branch either leaves the
 * turn with the player or hands it to the dealer. `nextEvents` picks the table up from there.
 *
 * Playing the dealer out from here is what used to strand a hand of exactly 21: the early return
 * left the turn with a player who had no legal action to take.
 */
export function resolveAction(state: BlackjackState, action: Action): BlackjackEvent[] {
  const events: BlackjackEvent[] = []
  let current = state
  const emit = (event: BlackjackEvent) => {
    events.push(event)
    current = reduce(current, event)
  }

  if (action === 'stand') {
    emit({ kind: 'stand', by: 'player' })
    return events
  }

  const card = current.deck[0]
  if (!card) return [{ kind: 'end' }]
  emit({ kind: 'hit', by: 'player', rank: card.rank })
  if (isBust(current.hands.player)) emit({ kind: 'bust', by: 'player' })
  // Twenty-one needs no decision: it is stood for them rather than asked about.
  else if (handValue(current.hands.player).total === 21) emit({ kind: 'stand', by: 'player' })
  return events
}

/**
 * What happens with nobody deciding: the dealer's turn, or the next round. Null when the table is
 * waiting on the player, or the game is over.
 *
 * This is the whole of Blackjack's side of the driver. Every path that ends a player's turn runs
 * through it. There is one place a round can be opened and one place the dealer plays.
 */
export function nextEvents(state: BlackjackState): BlackjackEvent[] | null {
  if (state.over || state.turn === 'player') return null
  if (state.turn === null) return dealRound(state)

  const events: BlackjackEvent[] = []
  let current = state
  const emit = (event: BlackjackEvent) => {
    events.push(event)
    current = reduce(current, event)
  }

  if (current.holeDown) emit({ kind: 'reveal' })
  // A busted player leaves nothing to beat. The dealer turns the hole card over and stops.
  if (isBust(current.hands.player)) {
    events.push(...settle(current))
    return events
  }
  // Stand on 17 and up, hit below. Soft or hard makes no difference: this table stands on soft 17.
  while (handValue(current.hands.char).total < dealerStands && current.deck.length > 0) {
    emit({ kind: 'hit', by: 'char', rank: current.deck[0].rank })
  }
  if (isBust(current.hands.char)) emit({ kind: 'bust', by: 'char' })
  else emit({ kind: 'stand', by: 'char' })
  events.push(...settle(current))
  return events
}

/** Score the round, then either open the next one or close the game. */
function settle(state: BlackjackState): BlackjackEvent[] {
  const events: BlackjackEvent[] = [{ kind: 'settle', outcome: roundOutcome(state) }]
  const after = reduce(state, events[0])
  if (after.deck.length < shoeFloor) events.push({ kind: 'end' })
  return events
}

/** Who took the round. Read off the hands: it can be checked against them. */
export function roundOutcome(state: BlackjackState): Outcome {
  const player = handValue(state.hands.player).total
  const char = handValue(state.hands.char).total
  if (isBust(state.hands.player)) return 'char'
  if (isBust(state.hands.char)) return 'player'
  // Blackjack beats a three-card twenty-one. Two of them push.
  const playerNatural = isBlackjack(state.hands.player)
  const charNatural = isBlackjack(state.hands.char)
  if (playerNatural !== charNatural) return playerNatural ? 'player' : 'char'
  if (player === char) return 'push'
  return player > char ? 'player' : 'char'
}

/** The side with more rounds, or null for a tie. */
export function winner(state: BlackjackState): Side | null {
  if (state.score.player === state.score.char) return null
  return state.score.player > state.score.char ? 'player' : 'char'
}
