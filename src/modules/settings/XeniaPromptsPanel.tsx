import { xeniaPrompts, xeniaPrompt } from '../../core/prompt/xeniaPrompts'
import { useSettings } from '../../core/stores/settingsStore'

/** Settings › Xenia Prompts: the prompts Xenia sends for its own features. Global. */
export default function XeniaPromptsPanel() {
  const overrides = useSettings((s) => s.xeniaPrompts)
  const setXeniaPrompt = useSettings((s) => s.setXeniaPrompt)
  return (
    <div className="settingsXeniaPrompts">
      <p className="hint">Prompts Xenia sends for its own features. They apply to every stack and chat.</p>
      {xeniaPrompts.map((p) => (
        <section key={p.id} className="settingsCard">
          <h3>{p.label}</h3>
          <p className="hint">{p.info}</p>
          <textarea
            className="settingsXeniaPromptText"
            rows={14}
            value={xeniaPrompt(p.id, overrides)}
            onChange={(e) => setXeniaPrompt(p.id, e.target.value)}
          />
          <button
            type="button"
            className="secondary"
            disabled={!overrides?.[p.id]?.trim()}
            onClick={() => setXeniaPrompt(p.id, '')}
          >
            Reset to default
          </button>
        </section>
      ))}
    </div>
  )
}
