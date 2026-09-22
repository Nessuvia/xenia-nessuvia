import type { PromptBlock, PromptStack } from '../../core/storage/types'
import { flatten, replaceBlock } from './blockTree'
import VariableControl from './VariableControl'

/**
 * A stack's block on/off toggles and its variables, the controls a chat or Story surfaces without
 * opening the full stack editor. Shared by the chat settings panel and the Story settings panel.
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
  const toggleable = flatten(stack.active).filter((r) => r.block.toggleable)
  const variables = stack.variables ?? []

  const flipBlock = (block: PromptBlock) =>
    onChange({ ...stack, active: replaceBlock(stack.active, { ...block, disabled: !block.disabled }) })

  if (toggleable.length === 0 && variables.length === 0) return <p className="hint">This stack has no toggles.</p>

  return (
    <>
      {variables.map((v, i) => (
        <div key={v.id} className="optionalBlock">
          <VariableControl
            variable={v}
            onChange={(next) => onChange({ ...stack, variables: variables.map((x, j) => (j === i ? next : x)) })}
          />
        </div>
      ))}
      {toggleable.map(({ block }) => (
        <div key={block.id} className="optionalBlock" title={block.info || undefined}>
          <label className="checkboxRow">
            <input type="checkbox" checked={!block.disabled} onChange={() => flipBlock(block)} />
            {block.label}
          </label>
        </div>
      ))}
    </>
  )
}
