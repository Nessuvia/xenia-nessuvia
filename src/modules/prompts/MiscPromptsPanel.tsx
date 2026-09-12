import type { PromptStack } from '../../core/storage/types'
import { defsForKind } from '../../core/prompt/miscPrompts'
import { stackKind } from './stackKinds'

interface Props {
  stack: PromptStack
  onChange(next: PromptStack): void
}

/**
 * The utility prompts this stack sends on the app's behalf. Rows come from the registry: a new
 * prompt shows up here without touching this file.
 *
 * Editing writes to the stack you have open, the same as any block, and rides the editor's autosave.
 */
export default function MiscPromptsPanel({ stack, onChange }: Props) {
  const defs = defsForKind(stackKind(stack))
  const overrides = stack.miscPrompts ?? {}

  const set = (id: string, text: string) =>
    onChange({ ...stack, miscPrompts: { ...overrides, [id]: text } })

  return (
    <section className="miscPrompts">
      <p className="hint">
        Sent by the app rather than assembled from blocks. These apply to chats using this stack.
      </p>
      {defs.map((def) => (
        <div key={def.id} className="panel miscPrompt">
          <div className="miscPromptHead">
            <div>
              <strong>{def.label}</strong>
              <p className="hint">{def.hint}</p>
            </div>
            <button
              type="button"
              disabled={!overrides[def.id]}
              onClick={() => set(def.id, '')}
            >
              Reset
            </button>
          </div>
          <textarea
            value={overrides[def.id] || def.text}
            onChange={(e) => set(def.id, e.target.value)}
            aria-label={def.label}
            rows={4}
          />
          {def.slots.length > 0 && (
            <ul className="miscPromptSlots">
              {def.slots.map((slot) => (
                <li key={slot.token}>
                  <code>{`{{${slot.token}}}`}</code> {slot.hint}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  )
}
