import { RiTextSnippet } from '@remixicon/react'
import {
  newTextRule,
  type DetectSettings,
  type TextRule,
} from '../../core/secondSweep/detectSettings'
import RuleCardHead from './RuleCardHead'
import './settings.css'

/** The syntax error for a rule's find, or null. Only regex rules can fail: a literal is escaped. */
function ruleError(rule: TextRule): string | null {
  if (!rule.regex || !rule.find.trim()) return null
  try {
    new RegExp(rule.find)
    return null
  } catch (err) {
    return (err as Error).message
  }
}

/**
 * Free-text rules: words and phrases to report to the editing model, with the instruction
 * written by the author.
 *
 * Separate from the Grammar Hammer because they are a different kind of thing. A Hammer rule
 * matches parts of speech and can strip or replace the text itself; these match words the way Find
 * & Replace does and only ever report.
 *
 * Prop-driven, like the Hammer panel: the rules belong to a pipeline record.
 */
export default function TextRulesPanel({
  detect,
  patch,
}: {
  detect: DetectSettings
  patch: (over: Partial<DetectSettings>) => void
}) {
  const rules = detect.textRules

  const patchRule = (id: string, over: Partial<TextRule>) =>
    patch({ textRules: rules.map((r) => (r.id === id ? { ...r, ...over } : r)) })

  return (
    <section className="textRules screenFrame">
      <span className="titleContainer">
        <h3>
          <RiTextSnippet size={14} className="hammerIcon" /> Free-text rules
        </h3>
      </span>

      <ul className="ruleCards screenBody">
        {rules.map((rule) => {
          const error = ruleError(rule)
          return (
            <li key={rule.id} className="card ruleCard">
              <RuleCardHead
                enabled={rule.enabled}
                label={rule.label ?? ''}
                scope={rule.scope}
                onChange={(over) => patchRule(rule.id, over)}
                onCopy={() => {
                  const i = rules.findIndex((r) => r.id === rule.id)
                  patch({ textRules: rules.toSpliced(i + 1, 0, { ...rule, id: crypto.randomUUID() }) })
                }}
                onDelete={() => patch({ textRules: rules.filter((r) => r.id !== rule.id) })}
              />
              <label className="ruleField">
                <span>Find</span>
                <input
                  className="patternInput"
                  value={rule.find}
                  placeholder="Leave blank to apply to every reply"
                  onChange={(e) => patchRule(rule.id, { find: e.target.value })}
                />
              </label>
              {rule.find ? (
                <div className="ruleField">
                  <span>Match</span>
                  <div className="ruleActionRow">
                    <label className="checkboxRow">
                      <input
                        type="checkbox"
                        checked={rule.regex}
                        onChange={(e) => patchRule(rule.id, { regex: e.target.checked })}
                      />
                      Regex
                    </label>
                    <label className="checkboxRow">
                      <input
                        type="checkbox"
                        checked={rule.caseSensitive}
                        onChange={(e) => patchRule(rule.id, { caseSensitive: e.target.checked })}
                      />
                      Match case
                    </label>
                  </div>
                </div>
              ) : (
                <p className="hint">Applies to every reply.</p>
              )}
              <label className="ruleField">
                <span>Tell the model</span>
                <textarea
                  className="ruleNoteInput"
                  rows={3}
                  value={rule.note}
                  placeholder="Stop opening sentences on an adverb."
                  onChange={(e) => patchRule(rule.id, { note: e.target.value })}
                />
              </label>
              {error && <p className="hint danger">{error}</p>}
            </li>
          )
        })}
        {rules.length === 0 && <p className="hint">No rules.</p>}
      </ul>

      <div className="grammarActions">
        <button type="button" onClick={() => patch({ textRules: [...rules, newTextRule()] })}>
          Add rule
        </button>
      </div>
    </section>
  )
}
