import type { InstructTemplate } from '../../core/params/paramDef'
import './paramBuilder.css'

/** The text every reply through this connection starts with, and how it's sent. */
export default function PrefillPanel({
  template,
  type,
  onChange,
}: {
  template: InstructTemplate
  type: 'chat' | 'text'
  onChange: (template: InstructTemplate) => void
}) {
  const enabled = template.prefillEnabled !== false

  const set = <K extends keyof InstructTemplate>(key: K, value: InstructTemplate[K]) =>
    onChange({ ...template, [key]: value })

  return (
    <div className="prefillPanel">
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => set('prefillEnabled', e.target.checked)}
        />
        Start every reply with set text
      </label>

      <label className="templateField">
        Prefill
        <textarea
          className="prefillText"
          rows={4}
          value={template.prefill ?? ''}
          disabled={!enabled}
          onChange={(e) => set('prefill', e.target.value)}
        />
        <span className="templateHint">
          {type === 'text'
            ? 'Written at the end of the prompt. The reply continues it.'
            : 'Sent as a final assistant message. The reply continues it.'}
        </span>
      </label>

      {type === 'chat' && (
        <label className="checkboxRow">
          <input
            type="checkbox"
            checked={template.prefillContinue ?? false}
            disabled={!enabled}
            onChange={(e) => set('prefillContinue', e.target.checked)}
          />
          Send continue_final_message
        </label>
      )}
      {type === 'chat' && (
        <small>
          vLLM and llama.cpp need that field to continue the last message. OpenAI rejects it. A
          backend that refuses the final assistant message sends the next reply without a prefill.
        </small>
      )}
    </div>
  )
}
