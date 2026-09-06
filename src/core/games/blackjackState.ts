// What the model is told about a Blackjack table. Same shape as gameState.ts does for Go Fish: a
// tagged block of board state, then one plain line about what just happened, written from the
// character's side. The character deals, so they see both hands, their own hole card included.

import type { BlackjackEvent, BlackjackState, Side } from './blackjack.ts'
import { handValue, isBlackjack, isBust } from './blackjack.ts'
import type { SideNames } from './sides.ts'
import { naming } from './sides.ts'

export interface StateBlockContext {
  tag?: string
  /** What to call the two sides. The block is always written to the character, so only the
   *  player's name is ever read out of it. */
  names?: SideNames
}

/**
 * A hand with the reading already done. Bust and blackjack are said in words rather than left as a
 * total to compare against 21: a model given `10, 9, 5 (24)` and nothing else works it out most of
 * the time, and the times it does not it tells the player they went bust when they did not.
 */
function readHand(state: BlackjackState, side: Side): string {
  const cards = state.hands[side]
  if (cards.length === 0) return 'nothing yet'
  const { total, soft } = handValue(cards)
  const note = isBust(cards) ? ', bust' : isBlackjack(cards) ? ', blackjack' : ''
  return `${cards.map((c) => c.rank).join(', ')} (${soft ? 'soft ' : ''}${total}${note})`
}

/** How the round that just settled went, in the character's second person. */
function readOutcome(state: BlackjackState, they: string): string {
  if (state.outcome === null) return ''
  if (state.outcome === 'push') return 'The last round pushed.'
  const bust = isBust(state.hands[state.outcome === 'player' ? 'char' : 'player'])
  const who = state.outcome === 'char' ? 'You took' : `${they} took`
  return `${who} the last round${bust ? ', the other hand went bust' : ''}.`
}

export function buildStateBlock(state: BlackjackState, ctx: StateBlockContext = {}): string {
  // The block is the character's own view, so the far side is the player.
  const far = naming('char', ctx.names)
  const lines: string[] = ['You are dealing Blackjack.']
  // Which round the hands below belong to, so they are read as this round and not as the transcript
  // above: without it a model reaches back through the history for the last bust it can find.
  // `round` counts rounds settled, so a settled table is still showing the hands of round `round`.
  lines.push(`Round ${state.outcome === null ? state.round + 1 : state.round}.`)
  lines.push(`Your hand: ${readHand(state, 'char')}`)
  if (state.holeDown && state.hands.char.length > 1) lines.push('Your second card is still face down.')
  lines.push(`${far.Theirs} hand: ${readHand(state, 'player')}`)
  lines.push(`Rounds won: you ${state.score.char}, ${far.them} ${state.score.player}`)
  lines.push(`Cards left in the shoe: ${state.deck.length}`)
  lines.push(
    state.over
      ? 'The shoe is finished.'
      : state.turn === 'player'
        ? `Waiting on ${far.them} to hit or stand.`
        : state.turn === 'char'
          ? 'Your play.'
          : 'Between rounds.',
  )
  // Last, next to the turn line: the hands above are the ones this settled. `deal` clears the
  // outcome, so there is never a result here belonging to a round that is no longer on the table.
  const outcome = readOutcome(state, far.they)
  if (outcome) lines.push(outcome)

  const body = lines.join('\n')
  const tag = (ctx.tag ?? 'gameState').trim()
  if (!tag) return body
  return `<${tag}>\n${body}\n</${tag}>`
}

/**
 * The events of one move in the second person. `you` picks whose side it reads from: the character
 * for the prompt, the player for the log on the board. The other side is called by name where
 * `names` has one, since "they" at a table of two is exactly the ambiguity that had characters
 * announcing the wrong person's bust.
 */
export function describeEvent(events: BlackjackEvent[], you: Side = 'char', names?: SideNames): string {
  const sentences: string[] = []
  const { mine, they } = naming(you, names)
  for (const event of events) {
    switch (event.kind) {
      case 'deal':
        sentences.push(you === 'char' ? 'You dealt a new round.' : `${they} dealt a new round.`)
        break
      case 'hit':
        sentences.push(mine(event.by) ? `You drew a ${event.rank}.` : `${they} drew a ${event.rank}.`)
        break
      case 'stand':
        sentences.push(mine(event.by) ? 'You stood.' : `${they} stood.`)
        break
      case 'bust':
        sentences.push(mine(event.by) ? 'You went bust.' : `${they} went bust.`)
        break
      case 'reveal':
        sentences.push(
          you === 'char' ? 'You turned your hole card over.' : `${they} turned the hole card over.`,
        )
        break
      case 'settle':
        sentences.push(
          event.outcome === 'push'
            ? 'The round pushed.'
            : mine(event.outcome)
              ? 'You took the round.'
              : `${they} took the round.`,
        )
        break
      case 'end':
        sentences.push('The shoe is finished.')
        break
      case 'say':
        break
    }
  }
  return sentences.join(' ')
}
