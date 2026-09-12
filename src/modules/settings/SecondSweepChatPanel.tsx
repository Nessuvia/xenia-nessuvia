import { Link } from 'react-router-dom'
import { useChats } from '../../core/stores/chatStore'
import { usePipelines } from '../../core/stores/pipelineStore'
import { useSettings } from '../../core/stores/settingsStore'
import { resolveSecondSweep } from '../../core/secondSweep/resolve'
import './settings.css'

/**
 * Second Sweep for the open chat, in the chat sidebar.
 *
 * Both controls write the **chat** record, never the global default and never the pipeline:
 * turning the pass on here must not change the next new chat, and picking a pipeline here must
 * not edit the pipeline. A chat that touches neither inherits global.
 */
export default function SecondSweepChatPanel() {
  const chat = useChats((s) => s.chat)
  const patchChat = useChats((s) => s.patchChat)
  const global = useSettings((s) => s.secondSweep)
  const pipelines = usePipelines((s) => s.pipelines)
  if (!chat) return null

  const override = chat.secondSweep
  const settings = resolveSecondSweep(global, override)
  const pipeline = pipelines.find((p) => p.id === settings.pipelineId)
  const set = (patch: typeof override) => patchChat({ secondSweep: { ...override, ...patch } })

  return (
    <div className="passChatPanel">
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        Sweep replies in this chat
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
          : 'No pipeline is selected. Nothing runs.'}
      </p>
      {override === undefined && <p className="hint">Using the global settings.</p>}
      <p className="hint">
        <Link to="/settings#secondSweep">Second Sweep settings</Link>
      </p>

      <button
        type="button"
        className="secondary"
        disabled={override === undefined}
        onClick={() => patchChat({ secondSweep: undefined })}
      >
        Use the global settings
      </button>
    </div>
  )
}
