// What the model is told. A tagged block of board state, then one plain line about what just
// happened. Written from the character's side of the table: "you" is the character, "they" is the
// player. Modelled on modules/bodyMap/output.ts::buildBlock, tag wrapper included, so an appearance
// tag rule can collapse it.

import { rankPlural, sortHand } from './deck.ts'
import type { Card, Rank } from './deck.ts'
import type { GoFishEvent, GoFishState, Side } from './goFish.ts'
import type { SideNames } from './sides.ts'
import { naming } from './sides.ts'

export interface StateBlockContext {
  /** Wrapper tag. Empty means the lines go in bare. */
  tag?: string
  /** What to call the two sides. The block is always written to the character, so only the
   *  player's name is ever read out of it. */
  names?: SideNames
  /**
   * The board as it stood when the move being described began.
   *
   * The block is built from the state *after* the move, so a card handed over is already gone from
   * `Your hand` while the fact line under the block says it was handed over. The model read the
   * hand and denied holding what it had just given away. When this is passed, the ranks that left
   * and joined the hand are named in the block itself, next to the hand they changed.
   */
  before?: GoFishState
}

/** Ranks in `from` that are no longer in `to`, counting duplicates: "3, 3" and not "3". */
function missing(from: Card[], to: Card[]): Rank[] {
  const left = to.slice()
  const out: Rank[] = []
  for (const card of sortHand(from)) {
    const i = left.findIndex((c) => c.rank === card.rank && c.suit === card.suit)
    if (i === -1) out.push(card.rank)
    else left.splice(i, 1)
  }
  return out
}

// There used to be a `seedMove` line here: "A good ask would be 3. A poor ask would be K." It was
// the bug behind the character announcing one rank while the board tracked another. Two reasons it
// could not be right. The block is built from the state *after* the move landed, so `chooseMove`
// ran on the next ask, not the one just made; and it named the 'best' rank while the driver plays
// the game's own difficulty, which defaults to 'average'. The model read a rank, said it, and the
// log said something else. The ask the code actually chose is already in the fact line under the
// block, and that is the only rank the model should ever see.

export function buildStateBlock(state: GoFishState, ctx: StateBlockContext = {}): string {
  // The block is the character's own view, so the far side is the player.
  const far = naming('char', ctx.names)
  // Which game this is comes from the block, so the prompt stack does not have to name one.
  const lines: string[] = ['You are playing Go Fish.']
  const hand = sortHand(state.hands.char).map((c) => c.rank)
  lines.push(`Your hand: ${hand.length ? hand.join(', ') : 'empty'}`)
  if (ctx.before) {
    const gone = missing(ctx.before.hands.char, state.hands.char)
    const got = missing(state.hands.char, ctx.before.hands.char)
    if (gone.length) lines.push(`You held ${gone.join(', ')} a moment ago and no longer do.`)
    if (got.length) lines.push(`You just picked up ${got.join(', ')}.`)
  }
  lines.push(`Your books: ${state.books.char.length ? state.books.char.join(', ') : 'none'}`)
  lines.push(`${far.Theirs} books: ${state.books.player.length ? state.books.player.join(', ') : 'none'}`)
  lines.push(`Cards left in the deck: ${state.deck.length}`)
  lines.push(state.over ? 'The game is over.' : state.turn === 'char' ? 'Your turn.' : `${far.Theirs} turn.`)

  const body = lines.join('\n')
  const tag = (ctx.tag ?? 'gameState').trim()
  if (!tag) return body
  return `<${tag}>\n${body}\n</${tag}>`
}

/**
 * One or two sentences covering the events of a single move, in the second person.
 *
 * `you` picks whose side the sentences are written from: the character, which is what the prompt
 * sends, or the player, which is what the log on the board shows. A card the reader cannot see is
 * never named. The other side is called by name where `names` has one, rather than "they".
 */
export function describeEvent(events: GoFishEvent[], you: Side = 'char', names?: SideNames): string {
  const sentences: string[] = []
  const { mine, they, them, theirs } = naming(you, names)
  for (const event of events) {
    switch (event.kind) {
      case 'ask':
        sentences.push(
          mine(event.by)
            ? `You asked ${them} for ${rankPlural(event.rank)}.`
            : `${they} asked you for ${rankPlural(event.rank)}.`,
        )
        break
      case 'give':
        sentences.push(
          mine(event.to)
            ? `${they} handed you ${event.count} ${rankPlural(event.rank)}.`
            : `You handed ${them} ${event.count} ${rankPlural(event.rank)}.`,
        )
        break
      case 'draw':
        // The other side's draw is face down, so its rank stays out of the line.
        sentences.push(mine(event.by) ? `You drew a ${event.rank}.` : `${they} drew from the deck.`)
        break
      case 'book':
        sentences.push(
          mine(event.by)
            ? `You completed a book of ${rankPlural(event.rank)}.`
            : `${they} completed a book of ${rankPlural(event.rank)}.`,
        )
        break
      case 'turn':
        sentences.push(mine(event.to) ? 'It is your turn.' : `It is ${theirs} turn.`)
        break
      case 'end':
        sentences.push('The game is over.')
        break
      case 'say':
        break
    }
  }
  return sentences.join(' ')
}
