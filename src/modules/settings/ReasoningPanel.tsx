import type { InstructTemplate, ReasoningConfig } from '../../core/params/paramDef'

const presets: { name: string; prefix: string; suffix: string }[] = [
  { name: 'think', prefix: '<think>', suffix: '</think>' },
  { name: 'thinking', prefix: '<thinking>', suffix: '</thinking>' },
  { name: 'reasoning', prefix: '<reasoning>', suffix: '</reasoning>' },
]

const blank = (): ReasoningConfig => ({
  prefix: '<think>',
  suffix: '</think>',
  autoParse: true,
  // Off by default: past thinking is usually the largest thing in a context and rarely helps.
  sendBack: false,
})

/**
 * Think-block markers for this connection. They are a property of the model, and they sit
 * here rather than in the global tag rules. With this off, the tag rules in Text rules apply.
 */
export default function ReasoningPanel({
  template,
  onChange,
}: {
  template: InstructTemplate
  onChange: (template: InstructTemplate) => void
}) {
  const reasoning = template.reasoning
  const set = (next: Partial<ReasoningConfig>) => {
    if (!reasoning) return
    onChange({ ...template, reasoning: { ...reasoning, ...next } })
  }

  if (!reasoning) {
    return (
      <div className="reasoningPanel">
        <p className="templateHint">
          This connection uses the tag rules in Text rules. Set markers here to override them for
          this model.
        </p>
        <button
          type="button"
          className="secondary"
          onClick={() => onChange({ ...template, reasoning: blank() })}
        >
          Set markers
        </button>
      </div>
    )
  }

  return (
    <div className="reasoningPanel">
      <div className="templateGrid">
        <label className="templateField">
          Opening marker
          <input value={reasoning.prefix} onChange={(e) => set({ prefix: e.target.value })} />
        </label>
        <label className="templateField">
          Closing marker
          <input value={reasoning.suffix} onChange={(e) => set({ suffix: e.target.value })} />
        </label>
      </div>

      <div className="reasoningPresets">
        {presets.map((p) => (
          <button
            key={p.name}
            type="button"
            className="secondary"
            onClick={() => set({ prefix: p.prefix, suffix: p.suffix })}
          >
            {p.name}
          </button>
        ))}
      </div>

      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={reasoning.autoParse}
          onChange={(e) => set({ autoParse: e.target.checked })}
        />
        Collapse the block in the reply
      </label>
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={reasoning.sendBack}
          onChange={(e) => set({ sendBack: e.target.checked })}
        />
        Send past thinking back in later prompts
      </label>
      {reasoning.sendBack && (
        <label className="templateField">
          Keep it on the last
          <input
            type="number"
            min={1}
            step={1}
            value={reasoning.maxSendBack ?? ''}
            placeholder="every turn"
            onChange={(e) =>
              set({ maxSendBack: e.target.value ? Number(e.target.value) : undefined })
            }
          />
          <span className="templateHint">Turns. Blank keeps it on all of them.</span>
        </label>
      )}

      <div className="editorActions">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            const { reasoning: _dropped, ...rest } = template
            onChange(rest)
          }}
        >
          Use the global tag rules
        </button>
      </div>
    </div>
  )
}
