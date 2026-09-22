import { useSettings, type Connection } from '../core/stores/settingsStore'
import './connectionPicker.css'

/**
 * Pick one of the user's connections. Hoisted out of the chat settings sidebar, which had the only
 * copy of this markup. The clean stage needs the same control to name the model that does the
 * editing.
 *
 * Two modes, from `allowActive`. Without it the picker names a connection outright, which is what
 * the global active-connection setting wants. With it, an "Active connection" row sits at the top
 * and reads back as `null`: the caller stores the null rather than the current id. The setting
 * keeps following whatever the user makes active later. Resolve it with `resolveConnection`.
 *
 * `filter` narrows the list, for a caller that can only use some of them: the sensors need a
 * decisions endpoint, and offering a chat connection there would fail on every reply. `allowNone`
 * adds a row that reads back as null and means off, which `allowActive`'s null does not.
 */
export default function ConnectionPicker({
  value,
  onChange,
  allowActive,
  label = 'Connection',
  disabled,
  filter,
  allowNone,
}: {
  /** A connection id, or null. With `allowActive`, null means "whatever is active". */
  value: string | null
  onChange: (id: string | null) => void
  allowActive?: boolean
  label?: string
  disabled?: boolean
  /** Only offer connections this returns true for. */
  filter?: (connection: Connection) => boolean
  /** Label for a row meaning "none", which reads back as null. */
  allowNone?: string
}) {
  const all = useSettings((s) => s.connections)
  // A decisions endpoint can't write prose, so it's out of every ordinary picker by default. A
  // caller that wants one passes a filter that says so.
  const connections = filter ? all.filter(filter) : all.filter((c) => !c.decisions)

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
        {allowNone && <option value="">{allowNone}</option>}
        {!allowActive && !allowNone && connections.length === 0 && <option value="">No connections</option>}
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  )
}
