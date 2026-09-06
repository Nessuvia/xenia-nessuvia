import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Avatar } from '../../app/Avatar'
import type { AvatarSource } from '../../core/storage/types'
import type { GoFishState } from '../../core/games/goFish'
import { winner } from '../../core/games/goFish'
import { cardTokens, rankPlural, sortHand } from '../../core/games/deck'
import { Card } from './Card'
import CharacterLine from './CharacterLine'
import { useCardMotion } from './useCardMotion'
import { useDiffOrigin } from './useDiffOrigin'

/**
 * How long the box counts down before it sends itself. The bar reads the same number as a CSS var,
 * so the animation and the timer cannot drift apart.
 */
const autoSendMs = 1500

/**
 * The play space: the character speaks at the top, you speak at the bottom, and the cards sit in
 * the field between. Those two rows are pinned, so nothing a card does moves them. Whose turn it
 * is shows as a ring on that avatar and nowhere else.
 *
 * Read-only is the same component with the input hidden, which is what History's scrubber renders.
 */
export default function GoFishBoard({
  state,
  seed,
  scale = 1,
  character,
  characterName,
  persona,
  personaName,
  line,
  streaming,
  chatBack = false,
  autoSend = false,
  error,
  notice,
  readOnly = false,
  awaitingNext = false,
  onSubmit,
  onNext,
}: {
  state: GoFishState
  /** Names the character's face-down cards without putting their ranks in the DOM. */
  seed: number
  /** 1 to 4. Multiplies the card's own width and height in CSS, so a bigger card takes more of the
   *  same field and the chrome keeps its size. */
  scale?: number
  character: AvatarSource | undefined
  characterName: string
  persona: AvatarSource | undefined
  personaName: string
  /** The character's latest line, or what is streaming right now. */
  line: string
  streaming: boolean
  /** The "respond to the character's turn" setting: keeps the box live off your turn. */
  chatBack?: boolean
  /** Clicking a card sends it on its own after `autoSendMs`. */
  autoSend?: boolean
  error?: string
  notice?: string
  readOnly?: boolean
  /** The table is parked on the step gate. Shows Next, and holds the box until it is clicked. */
  awaitingNext?: boolean
  onSubmit?: (text: string) => void
  onNext?: () => void
}) {
  const [text, setText] = useState('')
  // With chat back on the box stays live off your turn: what you type there is speech, not a move.
  const locked =
    readOnly || streaming || state.over || awaitingNext || (state.turn !== 'player' && !chatBack)
  const myTurn = state.turn === 'player'
  const books = [
    ...state.books.char.map((rank) => ({ rank, by: 'char' as const })),
    ...state.books.player.map((rank) => ({ rank, by: 'player' as const })),
  ]

  // Where a card that is new to the board came from: the zone that just lost one. The whole
  // arrival animation hangs off this, and it is a diff rather than a message from the store
  // because the board is the only thing that knows where it drew the zones.
  const table = useRef<HTMLDivElement>(null)
  const origin = useDiffOrigin(state, (previous, next) =>
    previous.deck.length > next.deck.length
      ? 'deck'
      : previous.hands.char.length > next.hands.char.length
        ? 'charHand'
        : previous.hands.player.length > next.hands.player.length
          ? 'playerHand'
          : null,
  )
  useCardMotion(table, origin, state, !readOnly)
  const token = useMemo(() => cardTokens(seed), [seed])

  /** What the character has shown it holds and has not since given up or booked away. */
  const known = state.known.player

  const send = () => {
    if (locked || !text.trim() || !onSubmit) return
    onSubmit(text)
    setText('')
  }

  // The auto-send countdown. A nonce rather than a flag: clicking a second card while the first is
  // counting down restarts it, and the bar has to start over with it.
  const [armed, setArmed] = useState(0)
  const sendRef = useRef(send)
  sendRef.current = send
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => {
      setArmed(0)
      sendRef.current()
    }, autoSendMs)
    return () => clearTimeout(timer)
  }, [armed])
  // Anything the player does to the box is them taking the turn back.
  const cancelAutoSend = () => setArmed(0)

  return (
    // The scale is a var the stylesheet multiplies the card metrics by. Nothing here is zoomed:
    // zoom on a container scales its layout box too, which left a hand wrapping after three cards.
    <div className="cardTableBoard" ref={table} style={{ '--cardTableScale': scale } as CSSProperties}>
      <div className="cardTableSpeakerRow">
        <Avatar
          of={character}
          name={characterName}
          className={`avatar cardTableAvatar${state.turn === 'char' && !state.over ? ' cardTableAvatarActive' : ''}`}
          title={characterName}
        />
        <CharacterLine line={line} streaming={streaming} awaitingNext={awaitingNext} onNext={onNext} />
      </div>

      <div className="cardTableField">
        {/* Face down: a hand you may not see stays out of the DOM. The id is a seeded token rather
            than the card or its position, so a card leaving the middle of the hand animates from
            where it sat without its rank ever being in the markup. */}
        <div className="cardTableHandRow" data-zone="charHand">
          {state.hands.char.map((card) => (
            <Card key={token(card)} id={token(card)} faceDown />
          ))}
        </div>

        {known.length > 0 && (
          <p className="goFishKnown">They have asked for {known.join(', ')}</p>
        )}

        <div className="goFishPool">
          {books.map((book, i) => (
            <span key={`${book.by}${book.rank}`} className="goFishBook">
              <Card
                card={{ rank: book.rank, suit: book.by === 'char' ? 'H' : 'S' }}
                id={`book${book.by}${book.rank}`}
                rotate={(i % 5) * 7 - 14}
                shift={(i % 3) * 4 - 4}
              />
            </span>
          ))}
          <span className="cardTableDeck" data-zone="deck">
            <Card faceDown id="deckTop" />
            <span className="cardTableDeckCount">{state.deck.length}</span>
          </span>
        </div>

        <div className="cardTableHandRow" data-zone="playerHand">
          {sortHand(state.hands.player).map((card) => (
            <Card
              key={`${card.rank}${card.suit}`}
              id={`${card.rank}${card.suit}`}
              card={card}
              onClick={
                locked || !myTurn
                  ? undefined
                  : () => {
                      setText(`got any ${rankPlural(card.rank)}`)
                      if (autoSend) setArmed((n) => n + 1)
                    }
              }
            />
          ))}
        </div>
      </div>

      <div className="cardTableSpeakerRow cardTableSpeakerRowPlayer">
        {readOnly ? (
          <span className="cardTableInputStandIn" />
        ) : state.over ? (
          <p className="cardTableResult">
            {winner(state) === 'player'
              ? 'You win.'
              : winner(state) === 'char'
                ? `${characterName} wins.`
                : 'A tie.'}
          </p>
        ) : (
          <span className="cardTableInputWrap">
            <input
              className="cardTableInput"
              value={text}
              disabled={locked}
              placeholder={locked ? 'Waiting…' : myTurn ? 'got any sevens' : 'say something'}
              onChange={(e) => {
                setText(e.target.value)
                cancelAutoSend()
              }}
              onKeyDown={(e) => {
                cancelAutoSend()
                if (e.key === 'Enter') send()
              }}
            />
            {/* The countdown, drawn as a border filling in from the left. Keyed by the nonce so a
                second click restarts the animation rather than continuing the old one, and over
                the input rather than on it so the text underneath stays readable. */}
            {armed > 0 && (
              <span
                key={armed}
                className="cardTableInputFill"
                style={{ '--cardTableAutoSend': `${autoSendMs}ms` } as CSSProperties}
              />
            )}
          </span>
        )}
        <Avatar
          of={persona}
          name={personaName}
          className={`avatar cardTableAvatar${state.turn === 'player' && !state.over ? ' cardTableAvatarActive' : ''}`}
          title={personaName}
        />
      </div>

      <div className="cardTableFooter">
        {notice ? <p className="cardTableNotice">{notice}</p> : null}
        {error ? <p className="cardTableError">{error}</p> : null}
      </div>
    </div>
  )
}
