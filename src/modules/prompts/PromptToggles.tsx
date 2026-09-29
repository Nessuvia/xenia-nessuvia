import type { PromptStack, StackVariable } from '../../core/storage/types'
import VariableControl from './VariableControl'
import StackLookView from './StackLookView'
import { hasLook, lookProblems } from './stackLook'

/**
 * A stack's variables, the controls a chat or Story surfaces without opening the full stack editor.
 * Shared by the chat settings panel and the Story settings panel. Blocks switch through the
 * variables their `when` names; there's no per-block control here.
 *
 * Writes go back to the shared stack via `onChange`: a change here changes every chat/Story on that
 * stack, new ones included. Per-scope overrides are the named upgrade path if that bites.
 */
export default function PromptToggles({
  stack,
  onChange,
}: {
  stack: PromptStack
  onChange: (stack: PromptStack) => void
}) {
  const variables = stack.variables ?? []
  const setVariable = (i: number, next: StackVariable) =>
    onChange({ ...stack, variables: variables.map((x, j) => (j === i ? next : x)) })

  if (variables.length === 0) return <p className="hint">This stack has no settings.</p>

  // A look with problems falls back to the standard list. The stack editor says why.
  if (hasLook(stack) && !lookProblems(stack).errors.length) {
    return <StackLookView stack={stack} onVariable={setVariable} />
  }

  return (
    <>
      {variables.map((v, i) => (
        <div key={v.id} className="optionalBlock">
          <VariableControl variable={v} onChange={(next) => setVariable(i, next)} />
        </div>
      ))}
    </>
  )
}
