import { useRef, useState, type CSSProperties } from 'react'
import { Avatar } from '../../app/Avatar'
import type { AvatarSource } from '../../core/storage/types'
import type { BlackjackState } from '../../core/games/blackjack'
import { handValue, isBust, legalActions, winner } from '../../core/games/blackjack'
import { Card } from './Card'
import CharacterLine from './CharacterLine'
import { useCardMotion } from './useCardMotion'
import { useDiffOrigin } from './useDiffOrigin'

/**
 * The Blackjack table. Same column as Go Fish, and the same shared `cardTable*` chrome: the
 * character deals from the top, you play at the bottom, and the shoe sits between you.
 *
 * Hit and Stand are buttons as well as words. Blackjack has exactly two moves and making someone
 * type them every round would be a worse game, but the box stays because the character is the
 * point and talking to them is half of it.
 */
export default function BlackjackBoard({
  state,
  scale = 1,
  character,
  characterName,
  persona,
  personaName,
  line,
  streaming,
  chatBack = false,
  error,
  notice,
  readOnly = false,
  awaitingNext = false,
  onSubmit,
  onNext,
}: {
  state: BlackjackState
  scale?: number
  character: AvatarSource | undefined
  characterName: string
  persona: AvatarSource | undefined
  personaName: string
  line: string
  streaming: boolean
  chatBack?: boolean
  error?: string
  notice?: string
  readOnly?: boolean
  /** The table is parked on the step gate. Shows Next, and holds the controls until it is clicked. */
  awaitingNext?: boolean
  onSubmit?: (text: string) => void
  onNext?: () => void
}) {
  const [text, setText] = useState('')
  const actions = legalActions(state)
  const canAct = !readOnly && !streaming && !awaitingNext && actions.length > 0
  // With chat back on the box stays live between rounds: what you type there is speech, not a move.
  const locked = readOnly || streaming || awaitingNext || (!canAct && !chatBack)

  const table = useRef<HTMLDivElement>(null)
  // Every card on this table comes off the shoe, so the origin never has to be worked out.
  const origin = useDiffOrigin(state, (previous, next) => (previous.deck.length > next.deck.length ? 'deck' : null))
  useCardMotion(table, origin, state, !readOnly)

  const send = () => {
    if (locked || !text.trim() || !onSubmit) return
    onSubmit(text)
    setText('')
  }

  const dealerCount = state.holeDown ? handValue(state.hands.char.slice(0, 1)).total : handValue(state.hands.char).total
  const playerHand = handValue(state.hands.player)

  return (
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
        {/* Hand and its count as one unit: stacked on a desktop, side by side on a phone, where six
            full-width rows in the field is more vertical than a short screen has. */}
        <div className="blackjackHandLine">
          {/* --handCount and data-noSwipe: see the note on the Go Fish hand rows. */}
          <div
            className="cardTableHandRow"
            data-zone="charHand"
            data-noSwipe
            style={{ '--handCount': state.hands.char.length } as CSSProperties}
          >
            {state.hands.char.map((card, i) =>
              // The hole card is face down until the dealer plays, so its rank is not in the DOM.
              // Its motion id stays 'charHole' either way: identity is not the face, and changing
              // it on the reveal made the card look like a new one landing rather than one turning
              // over.
              state.holeDown && i === 1 ? (
                <Card key="hole" id="charHole" faceDown />
              ) : (
                <Card
                  key={i === 1 ? 'hole' : `${card.rank}${card.suit}`}
                  id={i === 1 ? 'charHole' : `${card.rank}${card.suit}`}
                  card={card}
                />
              ),
            )}
          </div>
          <p className="blackjackCount">
            {state.hands.char.length > 0 && `${characterName}: ${dealerCount}${state.holeDown ? ' showing' : ''}`}
          </p>
        </div>

        <div className="blackjackShoe">
          <span className="cardTableDeck" data-zone="deck">
            <Card faceDown id="shoeTop" />
            <span className="cardTableDeckCount">{state.deck.length}</span>
          </span>
          <span className="cardTableDeckCount">
            Rounds {state.score.player} - {state.score.char}
          </span>
        </div>

        <div className="blackjackHandLine blackjackHandLinePlayer">
          <p className="blackjackCount">
            {state.hands.player.length > 0 &&
              `You: ${playerHand.soft ? 'soft ' : ''}${playerHand.total}${isBust(state.hands.player) ? ' — bust' : ''}`}
          </p>
          <div
            className="cardTableHandRow"
            data-zone="playerHand"
            data-noSwipe
            style={{ '--handCount': state.hands.player.length } as CSSProperties}
          >
            {state.hands.player.map((card) => (
              <Card key={`${card.rank}${card.suit}`} id={`${card.rank}${card.suit}`} card={card} />
            ))}
          </div>
        </div>

        {/* Always rendered, empty between turns: the row holds its height so the input and your
            avatar underneath do not jump every time it becomes your move. */}
        <div className="blackjackActions">
          {canAct && (
            <>
              <button type="button" className="blackjackButton" onClick={() => onSubmit?.('hit')}>
                Hit
              </button>
              <button type="button" className="blackjackButton" onClick={() => onSubmit?.('stand')}>
                Stand
              </button>
            </>
          )}
        </div>
      </div>

      <div className="cardTableSpeakerRow cardTableSpeakerRowPlayer">
        {readOnly ? (
          <span className="cardTableInputStandIn" />
        ) : state.over ? (
          <p className="cardTableResult">
            {winner(state) === 'player'
              ? 'You win the shoe.'
              : winner(state) === 'char'
                ? `${characterName} wins the shoe.`
                : 'A tie.'}
          </p>
        ) : (
          <input
            className="cardTableInput"
            value={text}
            disabled={locked}
            placeholder={locked ? 'Waiting…' : canAct ? 'hit or stand' : 'say something'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send()
            }}
          />
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
