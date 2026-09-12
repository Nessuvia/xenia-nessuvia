import { useState } from 'react'
import { RiAddLine, RiCloseLine, RiDeleteBinLine, RiDraggable, RiPencilLine } from '@remixicon/react'
import type { Connection } from '../../core/stores/settingsStore'
import type { ParamDef } from '../../core/params/paramDef'
import { useParamDefs } from '../../core/stores/paramDefsStore'
import { availableDefs, recommendedParams } from '../../core/params/connectionParams'
import ParamInput from './ParamInput'
import ParamDefModal from './ParamDefModal'
import './paramBuilder.css'

/**
 * The connection's request body, built by hand. Left is the form as it will be sent, in order;
 * right is the rest of the library. Dragging moves a param between the two, and the + and × do
 * the same thing for anyone not using a mouse.
 *
 * Only what's on the left is sent. A param dragged off stops being in the request entirely rather
 * than reset to its default. A backend can apply its own default, and a strict endpoint won't
 * reject a key it doesn't know.
 */
export default function ParamBuilder({
  connection,
  onChange,
}: {
  connection: Connection
  onChange: (connection: Connection) => void
}) {
  const defs = useParamDefs((s) => s.defs)
  const removeDef = useParamDefs((s) => s.remove)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ParamDef | null>(null)
  // Which library row is asking to be confirmed. Deleting a def removes it for every connection.
  // The row asks once rather than acting on the first click.
  const [confirming, setConfirming] = useState<string | null>(null)

  const byKey = new Map(defs.map((d) => [d.key, d]))
  // A param whose def was deleted is dropped from the list rather than shown as a mystery row:
  // buildRequestBody skips it too. A row here would claim something is sent that isn't.
  const rows = connection.params.filter((p) => byKey.has(p.key))
  const library = availableDefs(connection, defs)

  const setParams = (params: Connection['params']) => onChange({ ...connection, params })

  function add(def: ParamDef) {
    if (connection.params.some((p) => p.key === def.key)) return
    setParams([...connection.params, { key: def.key, value: def.default }])
  }

  function drop(targetKey: string | null) {
    const key = dragging
    setDragging(null)
    setOver(null)
    if (!key) return
    const def = byKey.get(key)
    if (!def) return

    // From the library: insert at the drop point, or append when dropped on open space.
    if (!connection.params.some((p) => p.key === key)) {
      if (!def.appliesTo.includes(connection.type)) return
      const at = targetKey ? rows.findIndex((p) => p.key === targetKey) : rows.length
      const next = [...connection.params]
      next.splice(at < 0 ? next.length : at, 0, { key, value: def.default })
      setParams(next)
      return
    }
    // Within the form: reorder.
    if (targetKey === key) return
    const without = connection.params.filter((p) => p.key !== key)
    const moved = connection.params.find((p) => p.key === key)!
    const at = targetKey ? without.findIndex((p) => p.key === targetKey) : without.length
    without.splice(at < 0 ? without.length : at, 0, moved)
    setParams(without)
  }

  return (
    <div className="paramBuilder">
      <div
        className={`paramColumn${over === 'form' ? ' dropTarget' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver('form')
        }}
        onDragLeave={() => setOver(null)}
        onDrop={() => drop(null)}
      >
        <h4>Parameters</h4>
        {rows.length === 0 && <p className="empty">Nothing is sent yet. Add a parameter.</p>}
        {rows.map((param) => {
          const def = byKey.get(param.key)!
          return (
            <div
              key={param.key}
              className={`paramRow${dragging === param.key ? ' dragging' : ''}`}
              draggable
              onDragStart={() => setDragging(param.key)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.stopPropagation()
                drop(param.key)
              }}
            >
              <RiDraggable size={16} className="dragHandle" aria-hidden />
              <span className="paramRowLabel">
                {def.label}
                <code>{def.key}</code>
              </span>
              <ParamInput
                def={def}
                value={param.value}
                onChange={(value) =>
                  setParams(
                    connection.params.map((p) => (p.key === param.key ? { ...p, value } : p)),
                  )
                }
              />
              <button
                type="button"
                className="paramRemove"
                title={`Remove ${def.label}`}
                aria-label={`Remove ${def.label}`}
                onClick={() => setParams(connection.params.filter((p) => p.key !== param.key))}
              >
                <RiCloseLine size={16} />
              </button>
              {def.hint && <small className="paramHint">{def.hint}</small>}
            </div>
          )
        })}
      </div>

      <div
        className={`paramColumn paramLibrary${over === 'library' ? ' dropTarget' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver('library')
        }}
        onDragLeave={() => setOver(null)}
        onDrop={() => {
          const key = dragging
          setDragging(null)
          setOver(null)
          if (key) setParams(connection.params.filter((p) => p.key !== key))
        }}
      >
        <h4>Available</h4>
        <button
          type="button"
          className="secondary"
          onClick={() => setParams(recommendedParams(connection, defs))}
        >
          Add recommended
        </button>
        {library.length === 0 && <p className="empty">All of them are added.</p>}
        {library.map((def) => (
          <div
            key={def.key}
            className="libraryRow"
            draggable
            onDragStart={() => setDragging(def.key)}
            onDragEnd={() => setDragging(null)}
          >
            <button type="button" className="paramAdd" title={`Add ${def.label}`} onClick={() => add(def)}>
              <RiAddLine size={16} />
            </button>
            <span className="paramRowLabel">
              {def.label}
              <code>{def.key}</code>
            </span>
            {confirming === def.key ? (
              <span className="confirmDelete">
                <button type="button" onClick={() => def.id !== undefined && removeDef(def.id)}>
                  Delete
                </button>
                <button type="button" className="secondary" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </span>
            ) : (
              <span className="libraryActions">
                <button
                  type="button"
                  className="paramRemove"
                  title={`Edit ${def.label}`}
                  aria-label={`Edit ${def.label}`}
                  onClick={() => setEditing(def)}
                >
                  <RiPencilLine size={14} />
                </button>
                <button
                  type="button"
                  className="paramRemove"
                  title={`Delete ${def.label} from the library`}
                  aria-label={`Delete ${def.label} from the library`}
                  onClick={() => setConfirming(def.key)}
                >
                  <RiDeleteBinLine size={14} />
                </button>
              </span>
            )}
          </div>
        ))}
        <button type="button" className="secondary" onClick={() => setModalOpen(true)}>
          New parameter
        </button>
      </div>

      {(modalOpen || editing) && (
        <ParamDefModal
          edit={editing ?? undefined}
          onClose={() => {
            setModalOpen(false)
            setEditing(null)
          }}
          onCreated={(def) => {
            setModalOpen(false)
            add(def)
          }}
        />
      )}
    </div>
  )
}
