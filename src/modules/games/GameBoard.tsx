import type { AvatarSource } from '../../core/storage/types'
import type { GameKind } from '../../core/games/gameEvent'
import type { GoFishState } from '../../core/games/goFish'
import type { BlackjackState } from '../../core/games/blackjack'
import type { AnyGameState } from './gamesStore'
import GoFishBoard from './GoFishBoard'
import BlackjackBoard from './BlackjackBoard'

/** Everything a board needs that is not the board's own state. Both boards take exactly this. */
export interface BoardProps {
  /** The game's shuffle seed. Only the boards' motion pass reads it, to name face-down cards
   *  without putting their ranks in the DOM. */
  seed: number
  scale?: number
  character: AvatarSource | undefined
  characterName: string
  persona: AvatarSource | undefined
  personaName: string
  /** The character's latest line, or what is streaming right now. */
  line: string
  streaming: boolean
  chatBack?: boolean
  /** Go Fish only: clicking a card sends it on its own a beat later. Blackjack is buttons, and a
   *  button that fires itself is a different question. */
  autoSend?: boolean
  error?: string
  notice?: string
  readOnly?: boolean
  /** The table is parked on the step gate, waiting for Next. */
  awaitingNext?: boolean
  onSubmit?: (text: string) => void
  onNext?: () => void
}

/**
 * Picks the board for a game. The cast is the same one the store's rules table makes: `kind` is
 * what decides which game a record is, and it is the only thing that can.
 */
export default function GameBoard({ kind, state, ...rest }: BoardProps & { kind: GameKind; state: AnyGameState }) {
  return kind === 'goFish' ? (
    <GoFishBoard state={state as GoFishState} {...rest} />
  ) : (
    <BlackjackBoard state={state as BlackjackState} {...rest} />
  )
}
