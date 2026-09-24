import { useState } from 'react'
import type { ReactNode } from 'react'
import { RiArrowRightSLine } from '@remixicon/react'

/** One rule in the Tags or Find & Replace list: a one-line summary that opens into its fields.
    A fresh (empty) rule starts open so its fields are there to type into. */
export function RuleCard({
  summary,
  startOpen,
  children,
}: {
  summary: ReactNode
  startOpen: boolean
  children: ReactNode
}) {
  // Read once: the card shouldn't snap shut the moment the first field gets a value.
  const [open, setOpen] = useState(startOpen)
  return (
    <li className="ruleCard">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="ruleCardSummary">
          <RiArrowRightSLine size={16} className="ruleCardChevron" />
          <span className="ruleCardLabel">{summary}</span>
        </summary>
        <div className="ruleCardBody">{children}</div>
      </details>
    </li>
  )
}
