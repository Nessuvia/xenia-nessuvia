// What happens at the table with nobody deciding.
//
// Both games have a state the player is not being asked about: the dealer's runout, the next round,
// the character's ask. That rule used to live in three places (a trailing `if` after a Blackjack
// action, a `while` loop in the store for Go Fish, and the dealer's turn buried inside
// `resolveAction`). Every stuck table was a branch that fell out of one of them. It lives here
// now. The store's only job is to pace what comes back.
//
// Pure and synchronous, like the rest of core/games: no timers, no React, no model. `next` returns
// events; applying them is the caller's job.

import type { BlackjackState } from './blackjack.ts'
import * as blackjack from './blackjack.ts'
import type { GoFishState, MoveQuality } from './goFish.ts'
import { chooseMove, resolveAsk } from './goFish.ts'
import type { GameEvent, GameKind } from './gameEvent.ts'

/** Either game's state. Both carry `over` and `turn`, which is all this file reads generically. */
export type AnyGameState = GoFishState | BlackjackState

export interface DriveOptions {
  difficulty?: MoveQuality
}

/** Null means the table is genuinely waiting on the player, or the game is over. */
export type Driver = (state: AnyGameState, options: DriveOptions) => GameEvent[] | null

/** The casts are the one place `GameKind` deciding which half of the union a state is has to be
 *  said out loud, the same bargain the `rules` table in the store makes. */
export const drivers: Record<GameKind, Driver> = {
  goFish: (state, options) => {
    const board = state as GoFishState
    if (board.over || board.turn !== 'char') return null
    const rank = chooseMove(board, 'char', options.difficulty ?? 'average')
    if (!rank) return null
    return resolveAsk(board, 'char', rank)
  },
  blackjack: (state) => blackjack.nextEvents(state as BlackjackState),
}

/**
 * How many times a caller may drive before it decides something is wrong. A Go Fish run of
 * successful asks is bounded by the deck, and a Blackjack shoe is bounded by `shoeFloor`. This
 * is a backstop and not a rule: reaching it is a bug, not a long game.
 */
export const driveGuard = 200
