import { useSettings } from '../../core/stores/settingsStore'
import ConnectionPicker from '../../app/ConnectionPicker'

/** The chat sidebar's Ideas section. Both settings are global: they apply to every chat. */
export default function IdeasPanel() {
  const ideas = useSettings((s) => s.ideas)
  const setIdeas = useSettings((s) => s.setIdeas)

  return (
    <div className="chatIdeasPanel">
      <label className="checkboxRow">
        <input type="checkbox" checked={ideas.enabled} onChange={(e) => setIdeas({ enabled: e.target.checked })} />
        Suggest ideas above the input
      </label>
      <ConnectionPicker
        value={ideas.connectionId}
        allowActive
        label="Ideas connection"
        onChange={(connectionId) => setIdeas({ connectionId })}
      />
      <p className="hint">Both settings apply to every chat.</p>
    </div>
  )
}
