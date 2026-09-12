import { useSettings } from '../core/stores/settingsStore'
import './connectionPicker.css'

/**
 * Pick one of the user's connections. Hoisted out of the chat settings sidebar, which had the only
 * copy of this markup, because the clean stage needs the same control to name the model that does the
 * editing.
 *
 * Two modes, from `allowActive`. Without it the picker names a connection outright, which is what
 * the global active-connection setting wants. With it, an "Active connection" row sits at the top
 * and reads back as `null`: the caller stores the null rather than the current id, so the setting
 * keeps following whatever the user makes active later. Resolve it with `resolveConnection`.
 */
export default function ConnectionPicker({
  value,
  onChange,
  allowActive,
  label = 'Connection',
  disabled,
}: {
  /** A connection id, or null. With `allowActive`, null means "whatever is active". */
  value: string | null
  onChange: (id: string | null) => void
  allowActive?: boolean
  label?: string
  disabled?: boolean
}) {
  const connections = useSettings((s) => s.connections)

  return (
    <label className="connectionPicker">
      {label}
      <select
        className="connectionPickerSelect"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
      >
        {allowActive && <option value="">Active connection</option>}
        {!allowActive && connections.length === 0 && <option value="">No connections</option>}
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  )
}
