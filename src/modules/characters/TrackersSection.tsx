import { useState } from 'react'
import { RiAddLine, RiDeleteBinLine, RiDraggable } from '@remixicon/react'
import { useDragReorder } from '../../app/useDragReorder'
import '../../app/dragReorder.css'
import { TrackerWidgets, trackerCssClasses } from '../../app/TrackerWidgets'
import type { Character } from '../../core/storage/types'
import { parseState, type TrackerDef } from '../../core/trackers/parseState'
import { initialValues, trackerPrompt, type TrackerValues } from '../../core/trackers/trackerState'
import { isFontId, trackerCssProblem } from '../../core/trackers/trackerCss'

type Kind = TrackerDef['type']
type View = 'widgets' | 'prompt' | 'parser'

const kindLabels: Record<Kind, string> = { number: 'Number', text: 'Text', list: 'List' }

/** A fresh def of a type, keeping the key, label and hidden flag of the one it replaces. */
function retyped(def: Pick<TrackerDef, 'key' | 'label' | 'hidden'>, type: Kind): TrackerDef {
  const common = { key: def.key, label: def.label, hidden: def.hidden }
  if (type === 'number') return { ...common, type, min: 0, max: 100 }
  if (type === 'text') return { ...common, type }
  return { ...common, type }
}

function unusedKey(defs: TrackerDef[]): string {
  for (let i = 1; ; i++) {
    const key = `tracker${i}`
    if (!defs.some((d) => d.key.toLowerCase() === key)) return key
  }
}

const splitList = (text: string) =>
  text
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

/**
 * The card's trackers: a reorderable row list, an inspector for the selected row, the creator's
 * CSS and font, and a preview. Sample values in the preview are local and reset on remount.
 */
export default function TrackersSection({
  character,
  onChange,
}: {
  character: Character
  onChange: (patch: Partial<Character>) => void
}) {
  const defs = character.trackers ?? []
  const [selected, setSelected] = useState(0)
  const [view, setView] = useState<View>('widgets')
  const [samples, setSamples] = useState<TrackerValues>({})
  const [tag, setTag] = useState('<state>\n\n</state>')

  const setDefs = (next: TrackerDef[]) => onChange({ trackers: next })
  const drag = useDragReorder((from, to) => {
    const next = [...defs]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setDefs(next)
    setSelected(to)
  })

  const current = defs[Math.min(selected, defs.length - 1)]
  const at = defs.indexOf(current)
  const patch = (p: Partial<TrackerDef>) => setDefs(defs.map((d, i) => (i === at ? ({ ...d, ...p } as TrackerDef) : d)))

  const values = { ...initialValues(defs), ...samples }
  const cssProblem = trackerCssProblem(character.trackerCss ?? '')
  const parsed = view === 'parser' ? parseState(tag, defs, values) : null
  const prompt = view === 'prompt' ? trackerPrompt(defs, values) : ''

  const keyProblem = (d: TrackerDef, i: number) =>
    !/^[A-Za-z0-9_]+$/.test(d.key)
      ? 'Use letters, digits and underscores.'
      : defs.some((o, j) => j !== i && o.key.toLowerCase() === d.key.toLowerCase())
        ? 'Another tracker has this key.'
        : ''

  return (
    <div className="trackersSection">
      <p className="hint">
        Values the model reads and changes with a {'<state>'} block in its reply. Players can edit them in the chat
        sidebar.
      </p>

      <div className="trackersEditor">
        <div className="trackersRail">
          {defs.length === 0 ? (
            <p className="hint">No trackers.</p>
          ) : (
            <ul className="trackersRowList">
              {defs.map((d, i) => (
                <li
                  key={i}
                  className={`trackersRow${i === at ? ' trackersRowSelected' : ''}${drag.over === i ? ' dropTarget' : ''}`}
                  {...drag.itemProps(i)}
                  onClick={() => setSelected(i)}
                >
                  <RiDraggable size={14} className="trackersRowHandle" />
                  <span className="trackersRowKey">{d.label || d.key}</span>
                  <span className="hint">{kindLabels[d.type]}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="trackersAdd">
            {(Object.keys(kindLabels) as Kind[]).map((type) => (
              <button
                key={type}
                type="button"
                title={`Add a ${kindLabels[type].toLowerCase()} tracker`}
                onClick={() => {
                  setDefs([...defs, retyped({ key: unusedKey(defs) }, type)])
                  setSelected(defs.length)
                }}
              >
                <RiAddLine size={14} />
                {kindLabels[type]}
              </button>
            ))}
          </div>
        </div>

        {current && (
          <div className="trackersInspector">
            <label title="The name the model writes in a <state> block and prompt conditions use: {% if key > 50 %}.">
              Key
              <input value={current.key} onChange={(e) => patch({ key: e.target.value.trim() })} />
            </label>
            {keyProblem(current, at) && <p className="hint trackersError">{keyProblem(current, at)}</p>}

            <label title="Shown to the player in place of the key. Empty uses the key.">
              Label
              <input value={current.label ?? ''} placeholder={current.key} onChange={(e) => patch({ label: e.target.value || undefined })} />
            </label>

            <label title="Number: a value in a range. Text: one word or phrase, optionally from a set. List: a set of items.">
              Type
              <select value={current.type} onChange={(e) => setDefs(defs.map((d, i) => (i === at ? retyped(d, e.target.value as Kind) : d)))}>
                {(Object.keys(kindLabels) as Kind[]).map((k) => (
                  <option key={k} value={k}>
                    {kindLabels[k]}
                  </option>
                ))}
              </select>
            </label>

            {current.type === 'number' && (
              <>
                <label title="The lowest value. A change below it fails.">
                  Minimum
                  <input type="number" value={current.min} onChange={(e) => patch({ min: Number(e.target.value) })} />
                </label>
                <label title="The highest value. A change above it fails.">
                  Maximum
                  <input type="number" value={current.max} onChange={(e) => patch({ max: Number(e.target.value) })} />
                </label>
                {current.min > current.max && <p className="hint trackersError">Minimum is above maximum.</p>}
                <label title="The value a new chat starts with. Empty uses the minimum.">
                  Starting value
                  <input
                    type="number"
                    value={current.initial ?? ''}
                    onChange={(e) => patch({ initial: e.target.value === '' ? undefined : Number(e.target.value) })}
                  />
                </label>
                <label className="checkboxRow" title="Draws a bar above the number in the chat panel.">
                  <input
                    type="checkbox"
                    checked={current.display === 'bar'}
                    onChange={(e) => patch({ display: e.target.checked ? 'bar' : undefined })}
                  />
                  Show as a bar
                </label>
              </>
            )}

            {current.type === 'text' && (
              <>
                <OptionsInput
                  title="Comma-separated. The model and the player pick from these. Empty allows any text."
                  label="Options"
                  value={current.options ?? []}
                  onChange={(options) => patch({ options: options.length ? options : undefined })}
                />
                <label title="The value a new chat starts with. Empty uses the first option.">
                  Starting value
                  <input value={current.initial ?? ''} onChange={(e) => patch({ initial: e.target.value || undefined })} />
                </label>
              </>
            )}

            {current.type === 'list' && (
              <OptionsInput
                title="Comma-separated items a new chat starts with."
                label="Starting items"
                value={current.initial ?? []}
                onChange={(initial) => patch({ initial: initial.length ? initial : undefined })}
              />
            )}

            <label className="checkboxRow" title="Keeps this tracker out of the prompt. The player still sees it, collapsed.">
              <input type="checkbox" checked={!!current.hidden} onChange={(e) => patch({ hidden: e.target.checked || undefined })} />
              Hide from the model
            </label>

            <button
              type="button"
              className="danger"
              onClick={() => {
                setDefs(defs.filter((_, i) => i !== at))
                setSelected(Math.max(0, at - 1))
              }}
            >
              <RiDeleteBinLine size={14} />
              Delete tracker
            </button>
          </div>
        )}
      </div>

      <label title="Styles the tracker widgets in the chat panel. Confined to the widgets. Anything that loads a file is refused.">
        Widget CSS
        <textarea
          rows={6}
          spellCheck={false}
          value={character.trackerCss ?? ''}
          onChange={(e) => onChange({ trackerCss: e.target.value || undefined })}
        />
      </label>
      {cssProblem && <p className="hint trackersError">{cssProblem} The CSS is ignored.</p>}
      <details className="trackersClassList">
        <summary>Class names</summary>
        <p className="hint">{trackerCssClasses.join(' · ')}</p>
      </details>

      <label title="A Fontsource font id for the widgets, like roboto-slab. Loaded from jsDelivr.">
        Widget font
        <input
          value={character.trackerFont ?? ''}
          placeholder="roboto-slab"
          onChange={(e) => onChange({ trackerFont: e.target.value.trim() || undefined })}
        />
      </label>
      {character.trackerFont && !isFontId(character.trackerFont) && (
        <p className="hint trackersError">Use a Fontsource id: lowercase letters, digits and hyphens.</p>
      )}

      {defs.length > 0 && (
        <div className="trackersPreview">
          <div className="trackersViews" role="tablist">
            {(
              [
                ['widgets', 'Widgets'],
                ['prompt', 'Prompt'],
                ['parser', 'Parser'],
              ] as [View, string][]
            ).map(([id, label]) => (
              <button key={id} type="button" className="trackersViewButton" role="tab" aria-selected={view === id} onClick={() => setView(id)}>
                {label}
              </button>
            ))}
          </div>

          {view === 'widgets' && (
            <>
              <p className="hint">Sample values. Not saved.</p>
              <TrackerWidgets
                defs={defs}
                values={values}
                onChange={(key, value) => setSamples({ ...samples, [key]: value })}
                css={character.trackerCss}
                font={character.trackerFont}
                scope={`trackerCard${character.id ?? 'New'}`}
              />
            </>
          )}

          {view === 'prompt' && (prompt ? <pre className="trackersPromptText">{prompt}</pre> : <p className="hint">Every tracker is hidden. Nothing is sent.</p>)}

          {view === 'parser' && parsed && (
            <>
              <label title="Paste a reply or a <state> block. Results use the sample values.">
                Reply
                <textarea rows={5} spellCheck={false} value={tag} onChange={(e) => setTag(e.target.value)} />
              </label>
              {parsed.changes.length === 0 && parsed.failures.length === 0 && <p className="hint">No changes.</p>}
              <ul className="trackersParseList">
                {parsed.changes.map((c, i) => (
                  <li key={`c${i}`}>
                    {c.key}: {Array.isArray(c.value) ? c.value.join(', ') : String(c.value)}
                  </li>
                ))}
                {parsed.failures.map((f, i) => (
                  <li key={`f${i}`} className="trackersError">
                    {f.attempted}: {f.error}
                  </li>
                ))}
              </ul>
              {parsed.changes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSamples({ ...samples, ...Object.fromEntries(parsed.changes.map((c) => [c.key, c.value])) })}
                >
                  Apply to sample values
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Comma-separated text that commits on blur, so a trailing comma survives typing. */
function OptionsInput({
  label,
  title,
  value,
  onChange,
}: {
  label: string
  title: string
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <label title={title}>
      {label}
      <input
        value={draft ?? value.join(', ')}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null) onChange(splitList(draft))
          setDraft(null)
        }}
      />
    </label>
  )
}
