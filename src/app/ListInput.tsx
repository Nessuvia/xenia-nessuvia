import { useState } from 'react'
import { formatList, parseList } from '../core/params/paramDef'

/**
 * Comma-separated text over a string array. Every field that stores a list uses it.
 *
 * The raw text is held here rather than round-tripped through the array: rebuilding the text from
 * the list on every keystroke eats a trailing comma, so a second item can't be typed, and any
 * difference from what was typed puts the caret at the end. Re-seeds from the value only when the
 * value changed underneath it. `\,` is a literal comma and `\n` a newline (see parseList).
 */
export function ListInput({
  value,
  placeholder,
  title,
  onChange,
}: {
  value: string[]
  placeholder?: string
  title?: string
  onChange: (list: string[]) => void
}) {
  const text = formatList(value)
  const [raw, setRaw] = useState(text)
  const [seed, setSeed] = useState(text)
  if (text !== seed) {
    setSeed(text)
    setRaw(text)
  }
  return (
    <input
      value={raw}
      placeholder={placeholder ?? 'Comma-separated'}
      title={title}
      onChange={(e) => {
        setRaw(e.target.value)
        const list = parseList(e.target.value)
        setSeed(formatList(list))
        onChange(list)
      }}
    />
  )
}
