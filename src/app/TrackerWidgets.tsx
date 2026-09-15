import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { RiCloseLine } from '@remixicon/react'
import type { TrackerDef, TrackerValue } from '../core/trackers/parseState'
import type { TrackerValues } from '../core/trackers/trackerState'
import { initialValues } from '../core/trackers/trackerState'
import { fontFamilyOf, isFontId, trackerCssProblem } from '../core/trackers/trackerCss'
import { scopeBackgroundCss } from '../core/palette/scopeCss'
import { loadWebfont } from '../core/palette/useApplyWebfont'
import './trackerWidgets.css'

/**
 * A card's trackers as editable widgets. The editor preview and the chat panel both render this.
 *
 * Creator CSS is scoped to the root element (`:scope` inside the CSS). Stable class names:
 * - `.trackerWidget` one tracker, with `data-tracker="key"` and `.trackerNumber`, `.trackerText`
 *   or `.trackerList`
 * - `.trackerLabel`, `.trackerValue` (the input or select)
 * - `.trackerBar`, `.trackerBarFill` on a number shown as a bar
 * - `.trackerListItems`, `.trackerListItem`, `.trackerListRemove`, `.trackerListAdd`
 * - `.trackerHiddenGroup` the collapsible holding trackers hidden from the model
 * Keep `trackerCssClasses` in step with this list.
 */
export const trackerCssClasses = [
  ':scope',
  '.trackerWidget',
  '[data-tracker="key"]',
  '.trackerNumber',
  '.trackerText',
  '.trackerList',
  '.trackerLabel',
  '.trackerValue',
  '.trackerBar',
  '.trackerBarFill',
  '.trackerListItems',
  '.trackerListItem',
  '.trackerListRemove',
  '.trackerListAdd',
  '.trackerHiddenGroup',
]

export function TrackerWidgets({
  defs,
  values,
  onChange,
  css,
  font,
  scope,
}: {
  defs: TrackerDef[]
  values: TrackerValues
  onChange: (key: string, value: TrackerValue) => void
  css?: string
  font?: string
  /** A class unique to the card, so two cards' CSS stays apart. */
  scope: string
}) {
  const scoped = useMemo(() => (css && !trackerCssProblem(css) ? scopeBackgroundCss(css, scope).css : ''), [css, scope])
  const fontOk = !!font && isFontId(font)

  useEffect(() => {
    if (fontOk) loadWebfont(`trackerWebfont-${font}`, true, font!, '--trackerFont')
  }, [fontOk, font])

  const defaults = initialValues(defs)
  const widget = (d: TrackerDef) => (
    <Widget key={d.key} def={d} value={values[d.key] ?? defaults[d.key]} onChange={(v) => onChange(d.key, v)} />
  )
  const shown = defs.filter((d) => !d.hidden)
  const hidden = defs.filter((d) => d.hidden)

  return (
    <div
      className={`trackerWidgets ${scope}`}
      style={fontOk ? ({ '--trackerFont': `"${fontFamilyOf(font!)}"` } as CSSProperties) : undefined}
    >
      {scoped && <style>{scoped}</style>}
      {shown.map(widget)}
      {hidden.length > 0 && (
        <details className="trackerHiddenGroup">
          <summary>Hidden from the model ({hidden.length})</summary>
          {hidden.map(widget)}
        </details>
      )}
    </div>
  )
}

function Widget({ def, value, onChange }: { def: TrackerDef; value: TrackerValue; onChange: (v: TrackerValue) => void }) {
  const label = <span className="trackerLabel">{def.label || def.key}</span>

  if (def.type === 'number') {
    const n = typeof value === 'number' ? value : def.min
    const span = def.max - def.min
    return (
      <div className="trackerWidget trackerNumber" data-tracker={def.key}>
        {label}
        {def.display === 'bar' && (
          <div className="trackerBar">
            <div className="trackerBarFill" style={{ width: `${span ? ((n - def.min) / span) * 100 : 100}%` }} />
          </div>
        )}
        <CommitInput
          type="number"
          value={String(n)}
          title={`${def.min} to ${def.max}`}
          onCommit={(text) => {
            const next = Number(text)
            if (text.trim() && Number.isFinite(next)) onChange(Math.min(def.max, Math.max(def.min, next)))
          }}
        />
      </div>
    )
  }

  if (def.type === 'text') {
    const text = typeof value === 'string' ? value : ''
    return (
      <div className="trackerWidget trackerText" data-tracker={def.key}>
        {label}
        {def.options ? (
          <select className="trackerValue" value={text} onChange={(e) => onChange(e.target.value)}>
            {!def.options.includes(text) && <option value={text}>{text}</option>}
            {def.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <CommitInput value={text} onCommit={(t) => t !== text && onChange(t)} />
        )}
      </div>
    )
  }

  const items = Array.isArray(value) ? value : []
  return (
    <div className="trackerWidget trackerList" data-tracker={def.key}>
      {label}
      <ul className="trackerListItems">
        {items.map((item, i) => (
          <li key={`${item}-${i}`} className="trackerListItem">
            {item}
            <button
              type="button"
              className="trackerListRemove"
              title={`Remove ${item}`}
              aria-label={`Remove ${item}`}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <RiCloseLine size={12} />
            </button>
          </li>
        ))}
      </ul>
      <CommitInput
        className="trackerValue trackerListAdd"
        value=""
        placeholder="Add"
        clearOnCommit
        onCommit={(t) => t.trim() && onChange([...items, t.trim()])}
      />
    </div>
  )
}

/** Commits on blur or Enter. A chat edit writes a message record, so keystrokes stay local. */
function CommitInput({
  value,
  onCommit,
  clearOnCommit,
  className = 'trackerValue',
  ...rest
}: {
  value: string
  onCommit: (text: string) => void
  clearOnCommit?: boolean
  className?: string
  type?: string
  title?: string
  placeholder?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null) onCommit(draft)
    setDraft(null)
  }
  return (
    <input
      {...rest}
      className={className}
      value={draft ?? (clearOnCommit ? '' : value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setDraft(null)
      }}
    />
  )
}
