import { useState } from 'react'
import type { ReplaceRule, TagRule } from '../../core/stores/settingsStore'
import { newReplaceRule } from '../../core/stores/settingsStore'
import { guessTag, stripHtml } from '../../core/prompt/textRules'
import { RuleCard } from './RuleCard'
import './settings.css'

/** Returns the syntax error message for a rule's pattern, or null if it compiles. */
function ruleError(rule: ReplaceRule): string | null {
  if (!rule.regex || !rule.find) return null
  try {
    new RegExp(rule.find, rule.flags)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid pattern'
  }
}

/** Find & replace on screen, in the prompt, or both. Edits whichever set it's handed.
 *  `onMakeTag` swaps a flagged SillyTavern script for a tag rule in the same set. */
export default function FindReplacePanel({
  rules,
  onChange,
  onMakeTag,
}: {
  rules: ReplaceRule[]
  onChange(rules: ReplaceRule[]): void
  onMakeTag?(tag: TagRule, replacing: string): void
}) {
  const [advanced, setAdvanced] = useState(false)

  const patchRule = (id: string, patch: Partial<ReplaceRule>) =>
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  return (
    <section className="textRules screenFrame">
      <h3>Find & Replace</h3>
      <p className="hint">
        Changes message text on screen, in the prompt, or both. The stored message isn't altered.
      </p>

      <ul className="tagRules screenBody">
        {rules.map((rule) => {
          const error = ruleError(rule)
          return (
            <RuleCard
              key={rule.id}
              startOpen={!rule.find}
              summary={
                <>
                  {rule.name || (rule.find ? `${rule.find} → ${rule.replace}` : 'New rule')}
                  {rule.convert && <span className="hint"> · needs converting</span>}
                  {!rule.enabled && !rule.convert && <span className="hint"> · off</span>}
                </>
              }
            >
              <input
                value={rule.find}
                placeholder={rule.regex ? 'pattern' : 'find'}
                onChange={(e) => patchRule(rule.id, { find: e.target.value })}
              />
              <span aria-hidden>→</span>
              <input
                value={rule.replace}
                placeholder="replace"
                onChange={(e) => patchRule(rule.id, { replace: e.target.value })}
              />
              <select
                value={rule.target}
                onChange={(e) => patchRule(rule.id, { target: e.target.value as ReplaceRule['target'] })}
              >
                <option value="both">Both</option>
                <option value="assistant">Model</option>
                <option value="user">You</option>
              </select>
              <select
                value={rule.applies ?? 'display'}
                onChange={(e) => patchRule(rule.id, { applies: e.target.value as ReplaceRule['applies'] })}
              >
                <option value="display">On screen</option>
                <option value="prompt">In prompt</option>
                <option value="both">Screen and prompt</option>
              </select>
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => patchRule(rule.id, { enabled: e.target.checked })}
                />
                On
              </label>
              {advanced && (
                <>
                  <label className="checkboxRow">
                    <input
                      type="checkbox"
                      checked={rule.regex}
                      onChange={(e) => patchRule(rule.id, { regex: e.target.checked })}
                    />
                    Regex
                  </label>
                  <input
                    value={rule.flags}
                    placeholder="flags"
                    onChange={(e) => patchRule(rule.id, { flags: e.target.value })}
                  />
                </>
              )}
              <button
                type="button"
                className="danger"
                onClick={() => onChange(rules.filter((r) => r.id !== rule.id))}
              >
                Delete
              </button>
              {rule.convert && (
                <ConvertRow rule={rule} onPatch={(patch) => patchRule(rule.id, patch)} onMakeTag={onMakeTag} />
              )}
              {error && <p className="hint danger">{error}</p>}
            </RuleCard>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={() => onChange([...rules, newReplaceRule()])}
      >
        Add
      </button>
      <button type="button" onClick={() => setAdvanced(!advanced)}>
        {advanced ? 'Simple' : 'Advanced'}
      </button>
    </section>
  )
}

/** A SillyTavern script whose replacement is HTML. HTML shows as literal text here, so it's
 *  either turned into a tag rule, stripped to its text, or kept as written. */
function ConvertRow({
  rule,
  onPatch,
  onMakeTag,
}: {
  rule: ReplaceRule
  onPatch(patch: Partial<ReplaceRule>): void
  onMakeTag?(tag: TagRule, replacing: string): void
}) {
  const tag = guessTag(rule.find)
  const [mode, setMode] = useState<TagRule['mode']>('collapse')
  return (
    <div className="convertRow">
      <p className="hint">The replacement is HTML, which shows as literal text here.</p>
      {tag && onMakeTag && (
        <>
          <select value={mode} onChange={(e) => setMode(e.target.value as TagRule['mode'])}>
            <option value="collapse">Collapse</option>
            <option value="hide">Hide</option>
            <option value="unwrap">Content only</option>
          </select>
          <button
            type="button"
            onClick={() => onMakeTag({ id: crypto.randomUUID(), ...tag, mode, label: rule.name }, rule.id)}
          >
            Make tag rule for {tag.open}
          </button>
        </>
      )}
      <button type="button" onClick={() => onPatch({ replace: stripHtml(rule.replace), convert: undefined, enabled: true })}>
        Strip HTML
      </button>
      <button type="button" onClick={() => onPatch({ convert: undefined })}>
        Keep as is
      </button>
    </div>
  )
}
