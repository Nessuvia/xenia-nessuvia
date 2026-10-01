import { RiArrowRightLine } from '@remixicon/react'
import type { Rank } from '../../core/games/deck'
import SpoilerText from './SpoilerText'
import { useStickToBottom } from './useStickToBottom'

/**
 * The character's line at the top of a board, and the Next button that sits in its bottom right
 * while the table is parked on the step gate.
 *
 * The button is outside the scrolling paragraph on purpose: inside it, it'd scroll away with
 * the text it's asking you to finish reading.
 */
export default function CharacterLine({
  line,
  streaming,
  awaitingNext = false,
  secret = [],
  onNext,
}: {
  line: string
  /** Ranks the player can't see. A sentence naming one is covered until clicked. */
  secret?: Rank[]
  streaming: boolean
  awaitingNext?: boolean
  onNext?: () => void
}) {
  const ref = useStickToBottom(line)
  return (
    <span className="cardTableLineWrap">
      <p className={`cardTableLine gameText${awaitingNext ? ' cardTableLineGated' : ''}`} ref={ref}>
        {line ? <SpoilerText text={line} secret={secret} streaming={streaming} /> : streaming ? '…' : ''}
      </p>
      {awaitingNext && (
        <button type="button" className="cardTableNext" onClick={onNext}>
          Next
          <RiArrowRightLine size={14} />
        </button>
      )}
    </span>
  )
}
