import type { PromptStack, StackVariable } from '../../core/storage/types'
import VariableControl from './VariableControl'
import StackLookView from './StackLookView'
import { stackVariables, withValue } from '../../core/prompt/stackTemplate'
import { hasLook, lookProblems } from './stackLook'

/**
 * A stack's variables, the controls a chat or Story surfaces without opening the full stack editor.
 * Shared by the chat settings panel and the Story settings panel.
 *
 * Writes go to the shared stack's `values` via `onChange`: a change here changes every chat/Story on that
 * stack, new ones included. Per-scope overrides are the named upgrade path if that bites.
 */
export default function PromptToggles({
  stack,
  onChange,
}: {
  stack: PromptStack
  onChange: (stack: PromptStack) => void
}) {
  const variables = stackVariables(stack)
  const setVariable = (next: StackVariable) => onChange(withValue(stack, next))

  if (variables.length === 0) return <p className="hint">This stack has no settings.</p>

  // A look with problems falls back to the standard list. The stack editor says why.
  if (hasLook(stack) && !lookProblems(stack).errors.length) {
    return <StackLookView stack={stack} onChange={onChange} />
  }

  return (
    <>
      {variables.map((v) => (
        <div key={v.id} className="optionalBlock">
          <VariableControl variable={v} onChange={setVariable} />
        </div>
      ))}
    </>
  )
}
