import { useState } from 'react'
import type { ParamDef } from '../../core/params/paramDef'
import { formatList, parseList } from '../../core/params/paramDef'

/** A param's value as the input element wants it. */
export function asText(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * One def's control, rendered by its kind. Used by the connection's param builder and by the
 * character/chat override editor, so a custom param looks the same wherever it is set.
 *
 * `placeholder` carries the inherited value in the override editor, where an empty input means
 * inherit. In the builder there is nothing to inherit from and it stays unset.
 */
export default function ParamInput({
  def,
  value,
  placeholder,
  onChange,
}: {
  def: ParamDef
  value: unknown
  placeholder?: string
  onChange: (value: unknown) => void
}) {
  const text = asText(value)

  if (def.kind === 'bool') {
    return (
      <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
    )
  }

  if (def.kind === 'select') {
    return (
      <select value={text} onChange={(e) => onChange(e.target.value)}>
        {placeholder !== undefined && <option value="">Inherit</option>}
        {(def.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }

  if (def.kind === 'slider') {
    return (
      <span className="paramSlider">
        <input
          type="range"
          min={def.min ?? 0}
          max={def.max ?? 1}
          step={def.step ?? 0.01}
          // A range input has no empty state. The override editor's "inherit" shows as the
          // inherited value until the user moves it. The number box next to it is the real control.
          value={text === '' ? (placeholder ?? '0') : text}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          type="number"
          min={def.min}
          max={def.max}
          step={def.step}
          value={text}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      </span>
    )
  }

  if (def.kind === 'json') {
    return (
      <textarea
        rows={3}
        value={text}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  // Not `text`: a list is shown escaped. A newline entry stays visible as `\n` in a one-line
  // input rather than disappearing into it.
  if (def.kind === 'stringList') {
    const list = Array.isArray(value) ? value.map(String) : parseList(String(value ?? ''))
    return (
      <ListInput def={def} value={formatList(list)} placeholder={placeholder} onChange={onChange} />
    )
  }


  if (def.kind === 'number') {
    return (
      <input
        type="number"
        min={def.min}
        max={def.max}
        step={def.step}
        value={text}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    )
  }

  return (
    <input value={text} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  )
}

/**
 * Comma-separated text over a string array. The raw text is held here rather than round-tripped
 * through the array: splitting on every keystroke eats the separator, and a second item can't
 * be typed. Re-seeds from the value only when the value changed underneath it.
 */
function ListInput({
  def,
  value,
  placeholder,
  onChange,
}: {
  def: ParamDef
  value: string
  placeholder?: string
  onChange: (value: unknown) => void
}) {
  const [raw, setRaw] = useState(value)
  const [seed, setSeed] = useState(value)
  if (value !== seed) {
    setSeed(value)
    setRaw(value)
  }
  return (
    <input
      value={raw}
      placeholder={placeholder ?? 'Comma-separated'}
      title={def.hint}
      onChange={(e) => {
        setRaw(e.target.value)
        const list = parseList(e.target.value)
        setSeed(formatList(list))
        onChange(list)
      }}
    />
  )
}
