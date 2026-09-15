import { useState } from 'react'
import { RiErrorWarningLine } from '@remixicon/react'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import type { StateFailure } from '../../core/trackers/parseState'

/** A message's failed tracker updates. Renders nothing when the swipe had none. */
export default function TrackerWarning({ failures }: { failures?: StateFailure[] }) {
  const [open, setOpen] = useState(false)
  const ref = useCloseOnOutside<HTMLSpanElement>(open, () => setOpen(false))
  if (!failures?.length) return null
  return (
    <span className="trackerWarning" ref={ref}>
      <button
        type="button"
        className="trackerWarningButton"
        title="Tracker update failed"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <RiErrorWarningLine size={16} />
      </button>
      {open && (
        <ul className="card trackerWarningMenu">
          {failures.map((f, i) => (
            <li key={i} className="trackerWarningItem">
              <code className="trackerWarningAttempt">{f.attempted}</code>
              <span className="trackerWarningError">{f.error}</span>
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
