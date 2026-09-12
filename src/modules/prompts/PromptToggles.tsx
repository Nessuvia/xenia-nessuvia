import type { PromptBlock, PromptStack } from '../../core/storage/types'
import { flatten, replaceBlock } from './blockTree'
import RangeSlider from './RangeSlider'

/**
 * The block on/off toggles, option pickers and range sliders exposed by a stack, the controls a
 * chat or Story surfaces without opening the full stack editor. Shared by the chat settings panel
 * and the Story settings panel; works for either kind.
 *
 * Writes go back to the shared stack via `onChange`: a flip here changes every chat/Story on that
 * stack, new ones included. Per-scope overrides are the named upgrade path if that bites.
 */
export default function PromptToggles({
  stack,
  onChange,
}: {
  stack: PromptStack
  onChange: (stack: PromptStack) => void
}) {
  const optional = flatten(stack.active).filter(
    (r) => r.block.toggleable || (r.block.options?.length ?? 0) > 1 || r.block.input,
  )

  const patchBlock = (block: PromptBlock) =>
    onChange({
      ...stack,
      active: replaceBlock(stack.active, block),
    })
  const flipBlock = (block: PromptBlock) => patchBlock({ ...block, disabled: !block.disabled })

  if (optional.length === 0) return <p className="hint">This stack has no toggles.</p>

  return (
    <>
      {optional.map(({ block }) => (
        <div key={block.id} className="optionalBlock" title={block.info || undefined}>
          {block.toggleable && (
            <label className="checkboxRow">
              <input type="checkbox" checked={!block.disabled} onChange={() => flipBlock(block)} />
              {block.label}
            </label>
          )}
          {block.input?.kind === 'range' && (
            <div className="scrollPick">
              <span>{block.label}</span>
              <RangeSlider
                input={block.input}
                onChange={(input) => patchBlock({ ...block, input })}
              />
            </div>
          )}
          {(block.options?.length ?? 0) > 1 && (
            <label className="optionPick">
              {block.label}
              <select
                value={block.activeOption ?? 0}
                onChange={(e) => patchBlock({ ...block, activeOption: Number(e.target.value) })}
              >
                {block.options!.map((o, i) => (
                  <option key={i} value={i}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      ))}
    </>
  )
}
