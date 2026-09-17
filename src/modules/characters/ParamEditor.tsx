import type { Character, ParamOverrides } from '../../core/storage/types'
import type { Connection } from '../../core/stores/settingsStore'
import type { OverridableField } from '../../core/settings/resolveParams'
import { overridableFields, paramSource, paramSourceFor, resolveParams } from '../../core/settings/resolveParams'
import { useParamDefs } from '../../core/stores/paramDefsStore'
import ParamInput, { asText } from '../settings/ParamInput'

const fields: Record<OverridableField, { label: string }> = {
  contextLimit: { label: 'Context limit' },
  safetyMarginPct: { label: 'Safety margin %' },
}

/**
 * The override editor, used by the character editor and the chat panel. Pass `character` when
 * editing a chat: the chat inherits through its character, so that's where the inherited value
 * and its source come from. Omit it when editing the character itself, it can't inherit from
 * itself, so everything falls through to the connection.
 *
 * The sampler rows come from the connection, not from a list here: whichever params it sends are
 * the ones there's anything to override. A level can change what a sampler is set to; it can't
 * add one the connection doesn't send.
 *
 * `scopeLabel` names the level being edited in the "from x" tags. It defaults to 'chat' because
 * that's what `ParamSource` calls the innermost layer; Write passes 'story'.
 */
export default function ParamEditor({
  overrides,
  connection,
  character,
  scopeLabel = 'chat',
  onChange,
}: {
  overrides: ParamOverrides
  connection: Connection
  character?: Character
  scopeLabel?: string
  onChange: (next: ParamOverrides) => void
}) {
  const defs = useParamDefs((s) => s.defs)
  const inherited = resolveParams(connection, character)
  const byKey = new Map(defs.map((d) => [d.key, d]))

  // ParamSource names the innermost layer 'chat'; say what it is here.
  const sourceLabel = (source: string) => (source === 'chat' ? scopeLabel : source)

  // empty string means inherit, one input, no checkbox, no tri-state.
  function setField(field: OverridableField, text: string) {
    const next = { ...overrides }
    // Assignment through a union of field types needs the cast; the key set is the same.
    const patch = next as unknown as Record<string, unknown>
    if (!text.trim()) delete patch[field]
    else {
      const value = Number(text)
      if (!Number.isFinite(value)) return
      patch[field] = value
    }
    onChange(next)
  }

  function setParam(key: string, value: unknown) {
    const params = { ...overrides.params }
    // undefined and a blank string both mean inherit: the key is removed, not set to nothing.
    if (value === undefined || (typeof value === 'string' && !value.trim())) delete params[key]
    else if (Array.isArray(value) && !value.length) delete params[key]
    else params[key] = value
    const next: ParamOverrides = { ...overrides, params }
    if (!Object.keys(params).length) delete next.params
    onChange(next)
  }

  return (
    <div className="paramEditor">
      {connection.params.map((param) => {
        const def = byKey.get(param.key)
        if (!def) return null
        const source = paramSourceFor(param.key, character)
        const value = overrides.params?.[param.key]
        return (
          <label key={param.key} className="paramField">
            <span className="paramLabel">
              {def.label}
              <span className="paramSource">from {sourceLabel(source)}</span>
            </span>
            <span className="paramInput">
              <ParamInput
                def={def}
                value={value}
                placeholder={asText(
                  inherited.params.find((p) => p.key === param.key)?.value,
                )}
                onChange={(next) => setParam(param.key, next)}
              />
              <button
                type="button"
                className="paramClear"
                title={`Clear ${def.label}`}
                aria-label={`Clear ${def.label}`}
                disabled={value === undefined}
                onClick={() => setParam(param.key, undefined)}
              >
                ×
              </button>
            </span>
            {def.hint && <small className="paramHint">{def.hint}</small>}
          </label>
        )
      })}

      {overridableFields.map((field) => {
        const meta = fields[field]
        const value = asText(overrides[field])
        const source = paramSource(field, connection, character)
        return (
          <label key={field} className="paramField">
            <span className="paramLabel">
              {meta.label}
              <span className="paramSource">from {sourceLabel(source)}</span>
            </span>
            <span className="paramInput">
              <input
                type="number"
                value={value}
                placeholder={asText(inherited[field])}
                onChange={(e) => setField(field, e.target.value)}
              />
              <button
                type="button"
                className="paramClear"
                title={`Clear ${meta.label}`}
                aria-label={`Clear ${meta.label}`}
                disabled={value === ''}
                onClick={() => setField(field, '')}
              >
                ×
              </button>
            </span>
          </label>
        )
      })}
    </div>
  )
}
