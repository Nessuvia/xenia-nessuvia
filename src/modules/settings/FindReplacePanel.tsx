import { useState } from 'react'
import type { ReplaceRule } from '../../core/stores/settingsStore'
import { newReplaceRule, useAppearance, useSettings } from '../../core/stores/settingsStore'
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

/** Find & replace applied to messages on display. Global, same store as the rest of appearance. */
export default function FindReplacePanel() {
  const appearance = useAppearance()
  const setAppearance = useSettings((s) => s.setAppearance)
  const [advanced, setAdvanced] = useState(false)

  const patchRule = (id: string, patch: Partial<ReplaceRule>) =>
    setAppearance({
      replaceRules: appearance.replaceRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })

  return (
    <section className="textRules screenFrame">
      <h3>Find & Replace</h3>
      <p className="hint">
        Changes how message text is shown. The stored message isn't altered.
      </p>

      <ul className="tagRules screenBody">
        {appearance.replaceRules.map((rule) => {
          const error = ruleError(rule)
          return (
            <li key={rule.id}>
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
                onClick={() =>
                  setAppearance({ replaceRules: appearance.replaceRules.filter((r) => r.id !== rule.id) })
                }
              >
                Delete
              </button>
              {error && <p className="hint danger">{error}</p>}
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={() => setAppearance({ replaceRules: [...appearance.replaceRules, newReplaceRule()] })}
      >
        Add
      </button>
      <button type="button" onClick={() => setAdvanced(!advanced)}>
        {advanced ? 'Simple' : 'Advanced'}
      </button>
    </section>
  )
}
