import { useState } from 'react'
import type { ConnectionType, ParamDef, ParamKind } from '../../core/params/paramDef'
import { defFromSnippet } from '../../core/params/paramDef'
import { useParamDefs } from '../../core/stores/paramDefsStore'

const kinds: ParamKind[] = ['number', 'slider', 'text', 'bool', 'select', 'stringList', 'json']

/**
 * Adds a form element to the library, or edits one already in it. For a new one the input is a
 * line of JSON, the same line the backend's docs show, and everything under it is the shape
 * inferred from it. Editing skips that step and opens on the fields directly.
 *
 * A built-in is edited in place rather than forked: two defs cannot share a key. The key is how a
 * connection references one. Deleting it from the library is how to be rid of it.
 */
export default function ParamDefModal({
  edit,
  onClose,
  onCreated,
}: {
  /** The def to edit. Omitted for a new one. */
  edit?: ParamDef
  onClose: () => void
  onCreated: (def: ParamDef) => void
}) {
  const defs = useParamDefs((s) => s.defs)
  const create = useParamDefs((s) => s.create)
  const update = useParamDefs((s) => s.update)
  const [snippet, setSnippet] = useState('')
  const [draft, setDraft] = useState<ParamDef | null>(edit ?? null)
  const [error, setError] = useState('')

  function read(text: string) {
    setSnippet(text)
    setError('')
    if (!text.trim()) {
      setDraft(null)
      return
    }
    const parsed = defFromSnippet(text)
    if (!parsed) {
      setDraft(null)
      setError('Enter a JSON object with one key, e.g. { "dry_multiplier": 0.8 }')
      return
    }
    setDraft(parsed)
  }

  const set = <K extends keyof ParamDef>(key: K, value: ParamDef[K]) =>
    setDraft(draft && { ...draft, [key]: value })

  const toggleApplies = (type: ConnectionType) => {
    if (!draft) return
    const on = draft.appliesTo.includes(type)
    const appliesTo = on ? draft.appliesTo.filter((t) => t !== type) : [...draft.appliesTo, type]
    set('appliesTo', appliesTo)
  }

  async function save() {
    if (!draft) return
    if (!draft.key.trim()) {
      setError('The key is what gets sent. It cannot be blank.')
      return
    }
    if (defs.some((d) => d.key === draft.key && d.id !== edit?.id)) {
      setError(`${draft.key} is already in the library.`)
      return
    }
    if (edit?.id !== undefined) {
      await update(edit.id, draft)
      onClose()
      return
    }
    const id = await create(draft)
    if (id === null) {
      setError(`${draft.key} is already in the library.`)
      return
    }
    onCreated({ ...draft, id })
  }

  return (
    <div className="paramModalBackdrop" onClick={onClose}>
      <div className="paramModal panel" onClick={(e) => e.stopPropagation()}>
        <h3>{edit ? `Edit ${edit.label}` : 'New parameter'}</h3>
        {!edit && (
          <label>
            JSON
            <textarea
              rows={3}
              autoFocus
              value={snippet}
              placeholder='{ "dry_multiplier": 0.8 }'
              onChange={(e) => read(e.target.value)}
            />
          </label>
        )}
        {error && <small className="error">{error}</small>}

        {draft && (
          <>
            <div className="fieldRow">
              <label>
                Key
                <input value={draft.key} onChange={(e) => set('key', e.target.value)} />
              </label>
              <label>
                Label
                <input value={draft.label} onChange={(e) => set('label', e.target.value)} />
              </label>
              <label>
                Kind
                <select value={draft.kind} onChange={(e) => set('kind', e.target.value as ParamKind)}>
                  {kinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {(draft.kind === 'number' || draft.kind === 'slider') && (
              <div className="fieldRow">
                <label>
                  Min
                  <input
                    type="number"
                    value={draft.min ?? ''}
                    onChange={(e) => set('min', e.target.value === '' ? undefined : Number(e.target.value))}
                  />
                </label>
                <label>
                  Max
                  <input
                    type="number"
                    value={draft.max ?? ''}
                    onChange={(e) => set('max', e.target.value === '' ? undefined : Number(e.target.value))}
                  />
                </label>
                <label>
                  Step
                  <input
                    type="number"
                    value={draft.step ?? ''}
                    onChange={(e) => set('step', e.target.value === '' ? undefined : Number(e.target.value))}
                  />
                </label>
              </div>
            )}

            {draft.kind === 'select' && (
              <label>
                Options (comma-separated)
                <input
                  value={(draft.options ?? []).join(', ')}
                  onChange={(e) =>
                    set(
                      'options',
                      e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    )
                  }
                />
              </label>
            )}

            <label>
              Hint
              <input value={draft.hint ?? ''} onChange={(e) => set('hint', e.target.value)} />
            </label>

            <fieldset className="appliesTo">
              <legend>Applies to</legend>
              <label>
                <input
                  type="checkbox"
                  checked={draft.appliesTo.includes('chat')}
                  onChange={() => toggleApplies('chat')}
                />
                Chat completion
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.appliesTo.includes('text')}
                  onChange={() => toggleApplies('text')}
                />
                Text completion
              </label>
            </fieldset>
          </>
        )}

        <div className="editorActions">
          <button type="button" onClick={save} disabled={!draft}>
            {edit ? 'Save' : 'Add'}
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
