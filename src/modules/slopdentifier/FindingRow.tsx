import { useState } from 'react'
import { RiAddLine, RiCheckLine } from '@remixicon/react'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import type { Pipeline } from '../../core/secondSweep/pipeline'
import type { Finding } from './analyse'
import { canAddRule, hasRuleFor } from './addRule'

/** Characters of surrounding text shown either side of the span. */
const CONTEXT = 40

const groupLabels: Record<Finding['group'], string> = {
  hammer: 'hammer',
  text: 'text',
  slop: 'slop',
  standing: 'standing',
}

export default function FindingRow({
  finding,
  text,
  pipelines,
  onAdd,
}: {
  finding: Finding
  /** The cleaned passage the span indexes into. */
  text: string
  pipelines: Pipeline[]
  onAdd(pipeline: Pipeline): void
}) {
  const [open, setOpen] = useState(false)
  const ref = useCloseOnOutside<HTMLDetailsElement>(open, () => setOpen(false))
  const addable = canAddRule(finding) && pipelines.length > 0

  const span = finding.span
  const before = span ? text.slice(Math.max(0, span.start - CONTEXT), span.start) : ''
  const after = span ? text.slice(span.end, span.end + CONTEXT) : ''

  return (
    <li className="slopFinding">
      <div className="slopFindingHead">
        <span className={`slopChip slopChip${finding.group}`}>{groupLabels[finding.group]}</span>
        {addable && (
          <details
            className="slopAdd"
            ref={ref}
            open={open}
            onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary title="Add as a text rule">
              <RiAddLine size={14} />
              Add to pipeline
            </summary>
            <div className="slopAddMenu">
              {pipelines.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="slopAddMenuItem"
                  disabled={hasRuleFor(p.detect.textRules, finding)}
                  onClick={() => {
                    onAdd(p)
                    setOpen(false)
                  }}
                >
                  {hasRuleFor(p.detect.textRules, finding) && <RiCheckLine size={14} />}
                  {p.label || 'Untitled pipeline'}
                </button>
              ))}
            </div>
          </details>
        )}
      </div>

      {span && (
        <p className="slopQuote">
          <span className="slopQuoteContext">{before}</span>
          <mark className="slopMark">{text.slice(span.start, span.end)}</mark>
          <span className="slopQuoteContext">{after}</span>
        </p>
      )}

      <p className="slopFindingMessage">{finding.message}</p>
    </li>
  )
}
