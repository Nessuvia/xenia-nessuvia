import { RiArrowRightLine } from '@remixicon/react'
import { useStickToBottom } from './useStickToBottom'

/**
 * The character's line at the top of a board, and the Next button that sits in its bottom right
 * while the table is parked on the step gate.
 *
 * The button is outside the scrolling paragraph on purpose: inside it, it would scroll away with
 * the text it is asking you to finish reading.
 */
export default function CharacterLine({
  line,
  streaming,
  awaitingNext = false,
  onNext,
}: {
  line: string
  streaming: boolean
  awaitingNext?: boolean
  onNext?: () => void
}) {
  const ref = useStickToBottom(line)
  return (
    <span className="cardTableLineWrap">
      <p className={`cardTableLine${awaitingNext ? ' cardTableLineGated' : ''}`} ref={ref}>
        {line || (streaming ? '…' : '')}
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
