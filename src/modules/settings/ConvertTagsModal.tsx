import { useState } from 'react'
import { createPortal } from 'react-dom'
import { RiArrowDownLine, RiCloseLine } from '@remixicon/react'
import type { TagRule } from '../../core/stores/settingsStore'
import type { TagConversion } from '../../core/prompt/textRules'

const modeLabel: Record<TagRule['mode'], string> = {
  collapse: 'Collapse',
  hide: 'Hide',
  unwrap: 'Content only',
}

const roleLabel = { both: 'Both', assistant: 'Model', user: 'User' }

/** Review find/replace rules that `tagFromRule` can turn into tags. Accept All adds the new tags
 *  and deletes every listed rule. A covered rule's Delete removes it straight away. */
export default function ConvertTagsModal({
  conversions,
  onDelete,
  onAccept,
  onClose,
}: {
  conversions: TagConversion[]
  onDelete(ruleId: string): void
  onAccept(tags: TagRule[], ruleIds: string[]): void
  onClose(): void
}) {
  const [deleted, setDeleted] = useState<string[]>([])
  const shown = conversions.filter((c) => !deleted.includes(c.rule.id))

  const accept = () => {
    // Two rules for the same marker make one tag; the first one listed wins.
    const fresh = shown.filter((c, i) => !c.covered && shown.findIndex((d) => d.tag.open === c.tag.open) === i)
    const tags = fresh.map((c) => ({ id: crypto.randomUUID(), ...c.tag }))
    onAccept(tags, shown.map((c) => c.rule.id))
    onClose()
  }

  // Portaled: a skin's backdrop-filter on the settings panel would trap a fixed backdrop inside it.
  return createPortal(
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <div className="palettePromptHead">
          <h3>Convert to tags</h3>
          <button type="button" title="Close" onClick={onClose}>
            <RiCloseLine size={16} />
          </button>
        </div>
        <p className="hint">These regex rules can be converted to tags. Review them below.</p>

        <ul className="convertTagsList">
          {shown.map(({ rule, tag, covered }) => (
            <li key={rule.id} className="card convertTagsCard">
              {rule.name && <strong className="convertTagsName">{rule.name}</strong>}
              <code className="convertTagsCode">{rule.find}</code>
              <code className="convertTagsCode">{rule.replace || '(empty)'}</code>
              <RiArrowDownLine size={16} className="convertTagsArrow" />
              {covered ? (
                <div className="convertTagsCovered">
                  <span className="hint">Already covered by the {tag.open} tag.</span>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      onDelete(rule.id)
                      setDeleted([...deleted, rule.id])
                    }}
                  >
                    Delete regex
                  </button>
                </div>
              ) : (
                <span className="convertTagsResult">
                  <code className="convertTagsCode">
                    {tag.open} … {tag.close}
                  </code>
                  {' · '}
                  {modeLabel[tag.mode]}
                  {tag.label && ` · ${tag.label}`}
                  {' · '}
                  {roleLabel[tag.target ?? 'both']}
                </span>
              )}
            </li>
          ))}
        </ul>

        <div className="dialogActions">
          <button type="button" onClick={accept} disabled={!shown.length}>
            Accept All
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
