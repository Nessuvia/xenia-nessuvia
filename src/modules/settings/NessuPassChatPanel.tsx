import { Link } from 'react-router-dom'
import { useChats } from '../../core/stores/chatStore'
import { usePipelines } from '../../core/stores/pipelineStore'
import { useSettings } from '../../core/stores/settingsStore'
import { resolveNessuPass } from '../../core/nessuPass/resolve'
import './settings.css'

/**
 * Nessu's Pass for the open chat, in the chat sidebar.
 *
 * Both controls write the **chat** record, never the global default and never the pipeline:
 * turning the pass on here must not change the next new chat, and picking a pipeline here must
 * not edit the pipeline. A chat that touches neither inherits global.
 */
export default function NessuPassChatPanel() {
  const chat = useChats((s) => s.chat)
  const patchChat = useChats((s) => s.patchChat)
  const global = useSettings((s) => s.nessuPass)
  const pipelines = usePipelines((s) => s.pipelines)
  if (!chat) return null

  const override = chat.nessuPass
  const settings = resolveNessuPass(global, override)
  const pipeline = pipelines.find((p) => p.id === settings.pipelineId)
  const set = (patch: typeof override) => patchChat({ nessuPass: { ...override, ...patch } })

  return (
    <div className="passChatPanel">
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        Pass replies in this chat
      </label>

      <label className="passChatPipeline">
        Pipeline
        <select
          value={settings.pipelineId ?? ''}
          onChange={(e) => set({ pipelineId: e.target.value ? Number(e.target.value) : undefined })}
        >
          <option value="">None</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <p className="hint">
        {pipeline
          ? `${pipeline.stages.filter((s) => s.enabled).length} stages run on each reply.`
          : 'No pipeline is selected, so nothing runs.'}
      </p>
      {override === undefined && <p className="hint">Using the global settings.</p>}
      <p className="hint">
        <Link to="/settings#nessuPass">Nessu's Pass settings</Link>
      </p>

      <button
        type="button"
        className="secondary"
        disabled={override === undefined}
        onClick={() => patchChat({ nessuPass: undefined })}
      >
        Use the global settings
      </button>
    </div>
  )
}
