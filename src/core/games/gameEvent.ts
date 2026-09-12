// One `games` table holds every game. One event type covers every game's log.
//
// The union is safe to widen: `end` and `say` have the same shape in both games, and every other
// kind is unique to one of them. `Game.kind` decides which half of the union a log is. The
// two casts in the store are the only places that has to be said out loud.

import type { BlackjackEvent } from './blackjack.ts'
import type { GoFishEvent } from './goFish.ts'

export type GameEvent = GoFishEvent | BlackjackEvent

/** Which games exist. Adding one means a new `core/games/<game>.ts` and a branch in gamesStore. */
export type GameKind = 'goFish' | 'blackjack'

export const gameLabels: Record<GameKind, string> = {
  goFish: 'Go Fish',
  blackjack: 'Blackjack',
}
