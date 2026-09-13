import { useMemo, useState } from 'react'
import { flagMessage, standingRules } from '../../core/secondSweep/rules'
import type { DetectSettings } from '../../core/secondSweep/detectSettings'
import { findFlags, previewStrips, stripText } from '../../core/hammer/strip'
import './settings.css'

/**
 * One preview for the whole panel: sample text run through the pipeline's rules, in one list
 * labelled by what each row did, an edit or a report.
 *
 * It sits outside the tab strip and is reachable from any tab. It runs whether or not the
 * pass is enabled: the point of it is deciding what to enable.
 *
 * The Slop-dentifier is the fuller version of this, with the lexicon and a rule button on each
 * finding. This one stays because it reads the pipeline being edited, unsaved rules included.
 */
export default function PassPreview({ detect }: { detect: DetectSettings }) {
  const settings = detect
  const [text, setText] = useState('')

  const edits = useMemo(() => {
    if (!text.trim()) return null
    return previewStrips(text, settings.rules, 'assistant')
  }, [text, settings.rules])

  // The actual text a message would render, repaired, with removals gone and replacements in place.
  const resultText = useMemo(() => {
    if (!text.trim()) return null
    return stripText(text, settings.rules, 'assistant').text
  }, [text, settings.rules])

  const rows = useMemo(() => {
    if (!text.trim()) return []
    // The flag rules see the edited text, the same string the model is shown.
    const cleaned = stripText(text, settings.rules, 'assistant').text
    const out: Array<{ source: string; slice?: string; message: string }> = []
    for (const r of edits?.removed ?? []) {
      out.push({
        source: 'Edit',
        slice: r.slice,
        message: r.replacement ? `Replaced with "${r.replacement}"` : 'Removed',
      })
    }
    for (const flag of findFlags(cleaned, settings.rules, 'assistant')) {
      out.push({ source: 'Report', slice: flag.slice, message: flagMessage(flag.rule, flag.slice) })
    }
    return out
  }, [text, edits, settings.rules])

  const standing = standingRules(settings.rules, 'assistant')

  return (
    <div className="grammarPreview passPreview">
      <textarea
        value={text}
        placeholder="Paste sample text to see what would be reported."
        rows={4}
        onChange={(e) => setText(e.target.value)}
      />
      {edits && edits.removed.length > 0 && (
        <>
          <div className="previewOut">{renderPreview(edits.text, edits.removed)}</div>
          <p className="previewLabel">Result</p>
          <div className="previewOut previewResult">{resultText}</div>
        </>
      )}
      {rows.length > 0 && (
        <ul className="textRuleMatches">
          {rows.map((row, i) => (
            <li key={i}>
              <span className="passPreviewSource">{row.source}</span>{' '}
              {row.slice && <span className="strippedSpan">{row.slice}</span>} {row.message}
            </li>
          ))}
        </ul>
      )}
      {text.trim() && rows.length === 0 && <p className="hint">No matches.</p>}
      {standing.length > 0 && (
        <p className="hint">
          {standing.length} {standing.length === 1 ? 'rule applies' : 'rules apply'} to every reply,
          on top of any matches.
        </p>
      )}
    </div>
  )
}

/** Render the preview text with removed spans struck through, and any replacement shown after. */
function renderPreview(
  text: string,
  removed: Array<{ start: number; end: number; slice: string; replacement: string }>,
) {
  if (removed.length === 0) return text
  const out: React.ReactNode[] = []
  let i = 0
  removed.forEach((r, idx) => {
    if (r.start > i) out.push(text.slice(i, r.start))
    out.push(
      <span key={`s${idx}`} className="strippedSpan">
        {r.slice}
      </span>,
    )
    if (r.replacement) {
      out.push(
        <span key={`r${idx}`} className="replacedSpan">
          {r.replacement}
        </span>,
      )
    }
    i = r.end
  })
  if (i < text.length) out.push(text.slice(i))
  return out
}
