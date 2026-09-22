import { useState } from 'react'
import type { PromptStack, StackVariable } from '../../core/storage/types'
import VariableControl from './VariableControl'

type Kind = StackVariable['kind']

const kindLabels: Record<Kind, string> = {
  sliderSingle: 'Slider',
  sliderRange: 'Range slider',
  dropdown: 'Dropdown',
  checkbox: 'Checkbox',
  text: 'Text',
}

/** A variable retyped to `kind`, keeping its name. Bounds and options start over. */
function withKind(v: StackVariable, kind: Kind): StackVariable {
  const base = { id: v.id, label: v.label, info: v.info }
  switch (kind) {
    case 'sliderSingle':
      return { ...base, kind, min: 0, max: 10, step: 1, value: 5 }
    case 'sliderRange':
      return { ...base, kind, min: 0, max: 10, step: 1, value: [3, 6] }
    case 'dropdown':
      return { ...base, kind, options: ['One', 'Two'], value: 'One' }
    case 'checkbox':
      return { ...base, kind, value: false }
    case 'text':
      return { ...base, kind, value: '' }
  }
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** Bounds edited: the current value moves inside them. */
function withBounds(v: StackVariable & { min: number; max: number; step: number }): StackVariable {
  if (v.kind === 'sliderSingle') return { ...v, value: clamp(v.value, v.min, v.max) }
  if (v.kind === 'sliderRange') {
    const lo = clamp(v.value[0], v.min, v.max)
    return { ...v, value: [lo, clamp(v.value[1], lo, v.max)] }
  }
  return v
}

function nextId(variables: StackVariable[]) {
  let n = variables.length + 1
  while (variables.some((v) => v.id === `var${n}`)) n++
  return `var${n}`
}

/** The stack editor's Variables column: every variable's current value, and its declaration. */
export default function VariablesPanel({
  stack,
  onChange,
}: {
  stack: PromptStack
  onChange: (stack: PromptStack) => void
}) {
  const variables = stack.variables ?? []
  const [editing, setEditing] = useState<number | null>(null)
  const setAll = (next: StackVariable[]) => onChange({ ...stack, variables: next })
  const setAt = (i: number, v: StackVariable) => setAll(variables.map((x, j) => (j === i ? v : x)))

  const add = () => {
    const id = nextId(variables)
    setAll([...variables, { id, label: id, kind: 'text', value: '' }])
    setEditing(variables.length)
  }

  return (
    <section className="panel stackZone">
      <div className="zoneHeader">
        <h3>Variables</h3>
        <button type="button" onClick={add}>
          Add variable
        </button>
      </div>
      <p className="hint">
        {'{{id}}'} in a block pastes the value. {'{% if id %}'} … {'{% endif %}'} branches on it.
      </p>
      <div className="blockList">
        {variables.map((v, i) => (
          <div key={i} className="promptsVariableRow">
            <div className="promptsVariableControl">
              <VariableControl variable={v} onChange={(next) => setAt(i, next)} />
            </div>
            <button type="button" className="secondary" onClick={() => setEditing(i)}>
              Edit
            </button>
          </div>
        ))}
        {variables.length === 0 && <p className="placeholder">No variables.</p>}
      </div>

      {editing !== null && variables[editing] && (
        <VariableModal
          variable={variables[editing]}
          taken={variables.filter((_, j) => j !== editing).map((v) => v.id.toLowerCase())}
          onChange={(v) => setAt(editing, v)}
          onDelete={() => {
            setAll(variables.filter((_, j) => j !== editing))
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}

function VariableModal({
  variable: v,
  taken,
  onChange,
  onDelete,
  onClose,
}: {
  variable: StackVariable
  taken: string[]
  onChange: (v: StackVariable) => void
  onDelete: () => void
  onClose: () => void
}) {
  const clash = taken.includes(v.id.toLowerCase())
  const refs =
    v.kind === 'sliderRange' ? `{{${v.id}_start}} and {{${v.id}_end}}` : `{{${v.id}}}`

  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Edit variable</h3>

        <label>
          Name
          <input value={v.label} onChange={(e) => onChange({ ...v, label: e.target.value })} />
        </label>
        <label>
          Id
          <input
            value={v.id}
            onChange={(e) => onChange({ ...v, id: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })}
          />
        </label>
        {clash ? (
          <p className="error">Another variable has this id.</p>
        ) : (
          <p className="hint">Blocks read it as {refs}.</p>
        )}

        <label>
          Type
          <select value={v.kind} onChange={(e) => onChange(withKind(v, e.target.value as Kind))}>
            {(Object.keys(kindLabels) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {kindLabels[k]}
              </option>
            ))}
          </select>
        </label>

        {(v.kind === 'sliderSingle' || v.kind === 'sliderRange') && (
          <div className="rangeConfig">
            {(['min', 'max', 'step'] as const).map((key) => (
              <label key={key}>
                {key === 'min' ? 'Min' : key === 'max' ? 'Max' : 'Step'}
                <input
                  type="number"
                  value={v[key]}
                  onChange={(e) => onChange(withBounds({ ...v, [key]: Number(e.target.value) }))}
                />
              </label>
            ))}
          </div>
        )}

        {v.kind === 'dropdown' && (
          <label>
            Options, one per line
            <textarea
              rows={4}
              value={v.options.join('\n')}
              onChange={(e) => {
                const options = e.target.value.split('\n')
                const kept = options.filter((o) => o.trim())
                onChange({ ...v, options, value: kept.includes(v.value) ? v.value : (kept[0] ?? '') })
              }}
            />
          </label>
        )}

        <VariableControl variable={v} onChange={onChange} />

        <label>
          Information
          <textarea rows={2} value={v.info ?? ''} onChange={(e) => onChange({ ...v, info: e.target.value })} />
        </label>
        <p className="hint">Shown when hovering this variable's control in chat settings.</p>

        <div className="dialogActions">
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
