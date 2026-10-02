// Which text rule sets a chat or a Story uses, in priority order. The caller owns where the list is
// written and says so in the hint.
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiIndeterminateCircleLine } from '@remixicon/react'
import { useAllSets } from '../core/stores/textRules'
import './ruleSetPicker.css'

export default function RuleSetPicker({
  ids: picked,
  onChange,
  scope,
  hint,
}: {
  ids: string[]
  onChange: (ids: string[]) => void
  /** What a remove button takes the set off: "this chat", "this Story". */
  scope: string
  hint: ReactNode
}) {
  const sets = useAllSets()
  const navigate = useNavigate()
  // A deleted set drops out of the list here, and mergeSets skips it on the send path.
  const ids = picked.filter((id) => sets.some((s) => s.id === id))
  const unused = sets.filter((s) => !ids.includes(s.id))

  return (
    <>
      {ids.length === 0 && <p className="hint">No rule sets selected.</p>}
      <ul className="ruleSetPickerList">
        {ids.map((id, i) => (
          <li key={id} className="ruleSetPickerRow">
            <select
              className="ruleSetPickerSelect"
              value={id}
              aria-label="Rule set"
              onChange={(e) => onChange(ids.map((x, j) => (j === i ? e.target.value : x)))}
            >
              {sets
                .filter((s) => s.id === id || !ids.includes(s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || 'Unnamed'}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="ruleSetPickerButton"
              onClick={() => navigate('/appearance#textRules', { state: { setId: id } })}
            >
              Edit
            </button>
            <button
              type="button"
              className="ruleSetPickerButton"
              aria-label={`Remove from ${scope}`}
              title={`Remove from ${scope}`}
              onClick={() => onChange(ids.filter((x) => x !== id))}
            >
              <RiIndeterminateCircleLine size={16} />
            </button>
          </li>
        ))}
      </ul>
      {unused.length > 0 && (
        <select
          className="ruleSetPickerSelect"
          value=""
          aria-label="Add a rule set"
          onChange={(e) => e.target.value && onChange([...ids, e.target.value])}
        >
          <option value="">Add a set...</option>
          {unused.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || 'Unnamed'}
            </option>
          ))}
        </select>
      )}
      <p className="hint">{hint}</p>
    </>
  )
}
