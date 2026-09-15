import { RiArrowDownSLine, RiArrowUpSLine, RiErrorWarningLine } from '@remixicon/react'

/**
 * A rule's collapsed row: on/off, a name, an error flag, and the chevron. Copy and delete live in the
 * open body. Rules only ever read model replies, so there is no scope picker.
 */
export default function RuleCardHead({
  enabled,
  hits,
  label,
  placeholder,
  error,
  open,
  onChange,
  onToggle,
}: {
  enabled: boolean
  /** Tester hits for this rule. Undefined until the tester has run. */
  hits?: number
  label: string
  /** Shown while the label is blank: the name the rule goes by until renamed. */
  placeholder: string
  error: string | null
  open: boolean
  onChange: (patch: { enabled?: boolean; label?: string }) => void
  onToggle: () => void
}) {
  return (
    <div className="ruleCardHead">
      <label className="ruleToggle">
        <input type="checkbox" checked={enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
      </label>
      <input
        className={`labelInput${enabled ? '' : ' ruleLabelOff'}`}
        value={label}
        placeholder={placeholder}
        onChange={(e) => onChange({ label: e.target.value || undefined })}
      />
      {hits !== undefined && <span className="postHitCount">{hits === 1 ? '1 hit' : `${hits} hits`}</span>}
      {error && <RiErrorWarningLine size={16} className="ruleErrorIcon" aria-label="Rule has an error" />}
      {/* Not CollapseButton: that one points sideways for panel rails. */}
      <button
        type="button"
        className="ruleChevron"
        title={open ? 'Hide rule' : 'Show rule'}
        aria-label={open ? 'Hide rule' : 'Show rule'}
        aria-expanded={open}
        onClick={onToggle}
      >
        {open ? <RiArrowUpSLine size={18} /> : <RiArrowDownSLine size={18} />}
      </button>
    </div>
  )
}
