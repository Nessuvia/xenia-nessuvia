import { RiDeleteBinLine, RiFileCopyLine } from '@remixicon/react'

/** The scope a rule applies to. Both rule kinds carry the same three. */
export type RuleScope = 'assistant' | 'user' | 'both'

/**
 * The top row every rule card shares: on/off, a name, who it applies to, copy and delete. Pulled
 * out of GrammarHammerPanel when the free-text rules became a second list with the same chrome.
 *
 * What the rule actually matches stays with each panel: that is the part that differs.
 */
export default function RuleCardHead({
  enabled,
  label,
  scope,
  onChange,
  onCopy,
  onDelete,
}: {
  enabled: boolean
  label: string
  scope: RuleScope
  onChange: (patch: { enabled?: boolean; label?: string; scope?: RuleScope }) => void
  onCopy: () => void
  onDelete: () => void
}) {
  return (
    <div className="ruleCardHead">
      <label className="ruleToggle">
        <input type="checkbox" checked={enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
      </label>
      <input
        className="labelInput"
        value={label}
        placeholder="Untitled rule"
        onChange={(e) => onChange({ label: e.target.value })}
      />
      <select value={scope} onChange={(e) => onChange({ scope: e.target.value as RuleScope })}>
        <option value="assistant">Model</option>
        <option value="user">You</option>
        <option value="both">Both</option>
      </select>
      {/* Icon plus label: the label is hidden at phone width, where the row has no space for two
          words of button. */}
      <button type="button" title="Copy" aria-label="Copy" onClick={onCopy}>
        <RiFileCopyLine size={16} />
        <span className="btnText">Copy</span>
      </button>
      <button type="button" className="danger" title="Delete" aria-label="Delete" onClick={onDelete}>
        <RiDeleteBinLine size={16} />
        <span className="btnText">Delete</span>
      </button>
    </div>
  )
}
