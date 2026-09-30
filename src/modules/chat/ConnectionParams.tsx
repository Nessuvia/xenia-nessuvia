import type { Connection } from '../../core/stores/settingsStore'
import { useSettings } from '../../core/stores/settingsStore'
import { useParamDefs } from '../../core/stores/paramDefsStore'
import ParamInput from '../settings/ParamInput'
import {
  promptProcessingOptions,
  singleLabelOptions,
  type PromptProcessing,
  type SingleLabels,
} from '../../core/connectors/promptProcessing'

/**
 * The active connection's own parameters, edited from the chat sidebar. This writes the global
 * level on purpose: per-character and per-chat overrides still exist in the character editor, but
 * the panel next to the chat is where people expect the knobs they turn.
 *
 * Which params show is the connection's list, same as everywhere else. Adding or removing one is
 * still ParamBuilder's job in Settings.
 */
export default function ConnectionParams({ connection }: { connection: Connection }) {
  const defs = useParamDefs((s) => s.defs)
  const updateConnection = useSettings((s) => s.updateConnection)
  const byKey = new Map(defs.map((d) => [d.key, d]))

  const setParam = (key: string, value: unknown) =>
    updateConnection({
      ...connection,
      params: connection.params.map((p) => (p.key === key ? { ...p, value } : p)),
    })

  return (
    <div className="paramEditor">
      {connection.type === 'chat' && (
        <label className="paramField">
          <span className="paramLabel">Prompt processing</span>
          <span className="paramInput">
            <select
              value={connection.promptProcessing ?? 'none'}
              onChange={(e) => updateConnection({ ...connection, promptProcessing: e.target.value as PromptProcessing })}
            >
              {promptProcessingOptions.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </span>
        </label>
      )}
      {connection.type === 'chat' && connection.promptProcessing === 'single' && (
        <label className="paramField">
          <span className="paramLabel">Labels</span>
          <span className="paramInput">
            <select
              value={connection.singleLabels ?? 'name'}
              onChange={(e) => updateConnection({ ...connection, singleLabels: e.target.value as SingleLabels })}
            >
              {singleLabelOptions.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </span>
        </label>
      )}

      {connection.params.map((param) => {
        const def = byKey.get(param.key)
        if (!def) return null
        return (
          <label key={param.key} className="paramField">
            <span className="paramLabel">{def.label}</span>
            <span className="paramInput">
              <ParamInput
                def={def}
                value={param.value}
                onChange={(next) => setParam(param.key, next)}
              />
            </span>
            {def.hint && <small className="paramHint">{def.hint}</small>}
          </label>
        )
      })}

      <label className="paramField">
        <span className="paramLabel">Context limit</span>
        <span className="paramInput">
          <input
            type="number"
            value={connection.contextLimit}
            onChange={(e) => updateConnection({ ...connection, contextLimit: Number(e.target.value) })}
          />
        </span>
      </label>

      <label className="paramField">
        <span className="paramLabel">Safety margin %</span>
        <span className="paramInput">
          <input
            type="number"
            value={connection.safetyMarginPct}
            onChange={(e) =>
              updateConnection({ ...connection, safetyMarginPct: Number(e.target.value) })
            }
          />
        </span>
      </label>
    </div>
  )
}
