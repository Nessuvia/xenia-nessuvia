import { useMemo, useState } from 'react'
import { findTextMatches, standingNotes } from '../../core/secondSweep/textRules'
import type { DetectSettings } from '../../core/secondSweep/detectSettings'
import { previewStrips, stripText } from '../../core/hammer/strip'
import './settings.css'

/**
 * One preview for the whole panel: sample text run through the Hammer and the free-text rules, in
 * one list labelled by what reported each row.
 *
 * It sits outside the tab strip so it is reachable from any tab, and it runs whether or not the
 * pass is enabled, since the point of it is deciding what to enable.
 *
 * The Slop-dentifier is the fuller version of this, with the lexicon and a rule button on each
 * finding. This one stays because it reads the pipeline being edited, unsaved rules included.
 */
export default function PassPreview({ detect }: { detect: DetectSettings }) {
  const settings = detect
  const [text, setText] = useState('')

  const hammer = useMemo(() => {
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
    // The checks and the free-text rules see the stripped text, the same string the model is shown.
    const cleaned = stripText(text, settings.rules, 'assistant').text
    const out: Array<{ source: string; slice?: string; message: string }> = []
    for (const r of hammer?.removed ?? []) {
      out.push({
        source: 'Hammer',
        slice: r.slice,
        message: r.replacement ? `Replaced with "${r.replacement}"` : 'Removed',
      })
    }
    for (const n of findTextMatches(cleaned, settings.textRules, 'assistant')) {
      out.push({ source: 'Rule', slice: n.slice, message: n.message })
    }
    return out
  }, [text, hammer, settings.rules, settings.textRules])

  const standing = standingNotes(settings.textRules, 'assistant')

  return (
    <div className="grammarPreview passPreview">
      <textarea
        value={text}
        placeholder="Paste sample text to see what would be reported…"
        rows={4}
        onChange={(e) => setText(e.target.value)}
      />
      {hammer && hammer.removed.length > 0 && (
        <>
          <div className="previewOut">{renderPreview(hammer.text, hammer.removed)}</div>
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
