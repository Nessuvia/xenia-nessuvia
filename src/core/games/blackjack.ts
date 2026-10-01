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
  /** The player sets how one ace in their hand counts, by its index in the hand. */
  | { kind: 'ace'; index: number; value: AceValue }

export type AceValue = 1 | 11
/** The player's ace choices for the current hand, by card index. The dealer's aces are never chosen. */
export type AceChoices = Record<number, AceValue>

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
  /** How the player chose to count their aces this hand. Cleared by each deal. */
  aces: AceChoices
}

/**
 * A hand's best total, whether an ace is still counting as eleven, and what each ace counts as.
 *
 * `chosen` is the player's say over their aces. An ace set to 1 stays 1. An ace set to 11 is a
 * preference: it holds until the hand would bust, and only then drops. Aces nobody chose drop
 * first, so a choice of 11 is the last thing to give way.
 */
export function handValue(
  hand: Card[],
  chosen: AceChoices = {},
): { total: number; soft: boolean; aceAs: Record<number, AceValue> } {
  let total = 0
  const auto: number[] = []
  const preferred: number[] = []
  const aceAs: Record<number, AceValue> = {}
  hand.forEach((card, i) => {
    if (card.rank === 'A') {
      if (chosen[i] === 1) {
        total += 1
        aceAs[i] = 1
        return
      }
      total += 11
      aceAs[i] = 11
      ;(chosen[i] === 11 ? preferred : auto).push(i)
    } else if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J' || card.rank === '10') {
      total += 10
    } else {
      total += Number(card.rank)
    }
  })
  // Every ace that would bust the hand drops to one, one at a time: unchosen ones first.
  for (const i of [...auto, ...preferred]) {
    if (total <= 21) break
    total -= 10
    aceAs[i] = 1
  }
  const soft = Object.values(aceAs).some((v) => v === 11)
  return { total, soft, aceAs }
}

/** Twenty-one on the first two cards, which beats twenty-one on three. */
export function isBlackjack(hand: Card[], chosen: AceChoices = {}): boolean {
  return hand.length === openingCards && handValue(hand, chosen).total === 21
}

export function isBust(hand: Card[], chosen: AceChoices = {}): boolean {
  return handValue(hand, chosen).total > 21
}

/** The aces the player's choices apply to: theirs, never the dealer's. */
export const choicesFor = (state: BlackjackState, side: Side): AceChoices => (side === 'player' ? state.aces : {})

/**
 * Whether the player may count the ace at `index` as `value` right now: on their turn, an ace, and
 * not a value that busts them on the spot. An 11 that would bust is refused rather than set and
 * dropped at once.
 */
export function canChooseAce(state: BlackjackState, index: number, value: AceValue): boolean {
  if (state.over || state.turn !== 'player') return false
  if (state.hands.player[index]?.rank !== 'A') return false
  const { total, aceAs } = handValue(state.hands.player, { ...state.aces, [index]: value })
  return total <= 21 && aceAs[index] === value
}

/** What the player can see of the dealer's hand: the hole card isn't in it. */
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
    aces: {},
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
        aces: {},
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
    case 'ace':
      return { ...state, aces: { ...state.aces, [event.index]: event.value } }
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
 * A hand of 21 isn't a decision: `resolveAction` stands it for them, and the turn is already
 * the dealer's by the time this is asked again. The bust check is the same story.
 */
export function legalActions(state: BlackjackState): Action[] {
  if (state.over || state.turn !== 'player') return []
  if (isBust(state.hands.player, state.aces)) return []
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
  if (isBlackjack(current.hands.player, current.aces) || isBlackjack(current.hands.char)) {
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
  if (isBust(current.hands.player, current.aces)) emit({ kind: 'bust', by: 'player' })
  // Twenty-one needs no decision: it's stood for them rather than asked about.
  else if (handValue(current.hands.player, current.aces).total === 21) emit({ kind: 'stand', by: 'player' })
  return events
}

/**
 * What happens with nobody deciding: the dealer's turn, or the next round. Null when the table is
 * waiting on the player, or the game is over.
 *
 * This is the whole of Blackjack's side of the driver. Every path that ends a player's turn runs
 * through it. There's one place a round can be opened and one place the dealer plays.
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
  if (isBust(current.hands.player, current.aces)) {
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
  const player = handValue(state.hands.player, state.aces).total
  const char = handValue(state.hands.char).total
  if (isBust(state.hands.player, state.aces)) return 'char'
  if (isBust(state.hands.char)) return 'player'
  // Blackjack beats a three-card twenty-one. Two of them push.
  const playerNatural = isBlackjack(state.hands.player, state.aces)
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
