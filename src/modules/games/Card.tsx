import type { CSSProperties } from 'react'
import type { Card as CardData } from '../../core/games/deck'
import { isRed } from '../../core/games/deck'

const pips: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }

/**
 * One card, drawn in CSS. The suit characters are typography.
 *
 * `rotate` and `shift` are the scatter of the pool. They are passed as vars: the value is
 * computed from the card's index. The styling itself stays in games.css.
 */
export function Card({
  card,
  id,
  faceDown = false,
  rotate = 0,
  shift = 0,
  onClick,
}: {
  card?: CardData
  /** Identity for the motion pass, stable across moving between rows. Face-down cards get a
   *  positional id from the caller. A hand nobody may see stays out of the DOM. */
  id?: string
  faceDown?: boolean
  rotate?: number
  shift?: number
  onClick?: () => void
}) {
  const style = { '--cardTableCardRotate': `${rotate}deg`, '--cardTableCardShift': `${shift}px` } as CSSProperties

  if (faceDown || !card) {
    return (
      <span className="cardTableCard cardTableCardBack" style={style} data-cardid={id} aria-label="face down card" />
    )
  }
  const suit = pips[card.suit] ?? ''
  const className = `cardTableCard${isRed(card.suit) ? ' cardTableCardRed' : ''}${onClick ? ' cardTableCardPickable' : ''}`
  return (
    <span
      className={className}
      style={style}
      data-cardid={id}
      aria-label={`${card.rank} ${card.suit}`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <span className="cardTableCardRank">{card.rank}</span>
      <span className="cardTableCardSuit">{suit}</span>
    </span>
  )
}
