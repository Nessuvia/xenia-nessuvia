import { useEffect, useState } from 'react'
import { usePersonas } from '../../core/stores/personasStore'
import type { DeletedPersona } from '../../core/stores/personaLinks'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Pick a deleted persona for this one to stand in for. Its old chats and games then show this
 *  persona's picture. Reuses .dialogBackdrop / .dialog / .dialogActions from chat.css. */
export default function LinkDeletedDialog({
  name,
  linked,
  onClose,
  onConfirm,
}: {
  name: string
  /** Ids the open draft already holds, saved or not. */
  linked: number[]
  onClose: () => void
  onConfirm: (id: number) => void
}) {
  const findDeleted = usePersonas((s) => s.findDeleted)
  const [rows, setRows] = useState<DeletedPersona[] | null>(null)
  const [picked, setPicked] = useState<number | null>(null)

  useEffect(() => {
    void findDeleted().then(setRows)
  }, [findDeleted])

  const shown = rows?.filter((r) => !linked.includes(r.id))

  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Link to deleted persona</h3>
        <p className="hint">Chats and games from the deleted persona show {name || 'this persona'}'s picture.</p>

        {shown === undefined && <p className="placeholder">Loading...</p>}
        {shown?.length === 0 && <p className="placeholder">No deleted personas.</p>}
        {shown && shown.length > 0 && (
          <ul className="linkDeletedList">
            {shown.map((r) => (
              <li key={r.id}>
                <label className="linkDeletedRow">
                  <input
                    type="radio"
                    name="linkDeleted"
                    checked={picked === r.id}
                    onChange={() => setPicked(r.id)}
                  />
                  <span className="linkDeletedName">{r.name || 'Unnamed'}</span>
                  <span className="linkDeletedMeta">
                    {plural(r.chats, 'chat')} · {plural(r.messages, 'message')} · {plural(r.games, 'game')}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="dialogActions">
          <button type="button" disabled={picked === null} onClick={() => onConfirm(picked!)}>
            Confirm
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
