import { useEffect, useRef, type CSSProperties } from 'react'
import { RiChat3Line } from '@remixicon/react'
import { CollapseButton, CollapseRail } from '../../app/CollapseButton'
import '../../app/sideDrawer.css'
import { describeEvent } from '../../core/games/gameState'
import { describeEvent as describeBlackjack } from '../../core/games/blackjackState'
import type { GoFishEvent } from '../../core/games/goFish'
import type { BlackjackEvent } from '../../core/games/blackjack'
import type { GameEvent, GameKind } from '../../core/games/gameEvent'
import { rankPlural } from '../../core/games/deck'

type Row = { key: number; side: 'char' | 'player' | 'system'; text: string }

/**
 * The log as a chat: oldest at the top, newest at the bottom, the character on the left and you on
 * the right, everything the table did between them in the middle.
 *
 * `turn` events are dropped. The ring on the active avatar already says whose move it is, and a
 * centred "it is their turn" after every single ask doubles the length of the log for nothing.
 */
function rows(kind: GameKind, events: GameEvent[], characterName: string): Row[] {
  // Read from your seat: you are "you", and the far side is the character by name rather than
  // "they", which is what the board already calls them everywhere else.
  const names = { char: characterName }
  const line = (event: GameEvent) =>
    kind === 'goFish'
      ? describeEvent([event as GoFishEvent], 'player', names)
      : describeBlackjack([event as BlackjackEvent], 'player', names)
  const out: Row[] = []
  events.forEach((event, i) => {
    if (event.kind === 'turn') return
    if (event.kind === 'say') {
      out.push({ key: i, side: event.by === 'char' ? 'char' : 'player', text: event.text })
      return
    }
    // Your ask is the thing you typed, so it reads as your side of the conversation, in your own
    // words. The character's ask stays in the middle: its voice is the line it says about the ask.
    if (event.kind === 'ask' && event.by === 'player') {
      out.push({ key: i, side: 'player', text: event.text || `Got any ${rankPlural(event.rank)}?` })
      return
    }
    if (event.kind === 'ask') {
      out.push({ key: i, side: 'system', text: `${characterName} asks for ${rankPlural(event.rank)}.` })
      return
    }
    out.push({ key: i, side: 'system', text: line(event) })
  })
  return out
}

export default function GameLog({
  kind,
  events,
  characterName,
  streamingText,
  open,
  width,
  onToggle,
  phone = false,
  drawerClassName = '',
  drawerStyle,
}: {
  kind: GameKind
  events: GameEvent[]
  characterName: string
  /** The line arriving right now, shown as the character's last bubble until it lands. */
  streamingText?: string
  open: boolean
  width: number
  onToggle: () => void
  /** Phone width: the panel is a drawer rather than a column, and the rail becomes a fixed button. */
  phone?: boolean
  /** From useSideDrawer in the view. Empty off a phone. */
  drawerClassName?: string
  drawerStyle?: CSSProperties
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const items = rows(kind, events, characterName)

  // Pinned to the bottom, the way a live chat is.
  useEffect(() => {
    const node = scroller.current
    if (node) node.scrollTop = node.scrollHeight
  }, [items.length, streamingText, open])

  // Off a phone a closed log collapses to its rail. On a phone the panel stays mounted whatever the
  // open state, because the drawer slides and tracks a finger, and an unmounted panel cannot.
  if (!open && !phone) return <CollapseRail label="Game log" onToggle={onToggle} className="gameLogRail" />

  return (
    <>
      {phone && !open && (
        <div className="drawerOpenButtons">
          <button
            type="button"
            className="drawerOpenButton"
            title="Open game log"
            aria-label="Open game log"
            onClick={onToggle}
          >
            <RiChat3Line size={20} />
          </button>
        </div>
      )}
      <div
        className={`panel gameLog ${drawerClassName}`.trim()}
        // A var rather than `width` directly: an inline width would beat the phone media query,
        // which has to widen the panel once it covers the screen.
        style={{ ...drawerStyle, '--gameLogWidth': `${width}px` } as CSSProperties}
      >
        <div className="gameLogHeader">
          <CollapseButton label="Game log" collapsed={false} onToggle={onToggle} />
          <span className="gameLogTitle">Log</span>
        </div>
        <div className="gameLogScroll" ref={scroller}>
          {items.map((row) => (
            <div key={row.key} className={`gameLogRow gameLogRow${row.side}`}>
              <span className={`gameLogBubble gameLogBubble${row.side}`}>{row.text}</span>
            </div>
          ))}
          {streamingText ? (
            <div className="gameLogRow gameLogRowchar">
              <span className="gameLogBubble gameLogBubblechar">{streamingText}</span>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
