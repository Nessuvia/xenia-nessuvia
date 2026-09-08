import { useState } from 'react'
import { RiHammerLine } from '@remixicon/react'
import {
  newGrammarHammerRule,
  useSecondPass,
  useSettings,
  type GrammarHammerRule,
} from '../../core/stores/settingsStore'
import RuleCardHead from './RuleCardHead'
import { tryCompile, POS_TAGS } from '../../core/hammer/pattern'
import './settings.css'

/** Returns the syntax error message for a rule's pattern, or null if it compiles. */
function ruleError(rule: GrammarHammerRule): string | null {
  if (!rule.pattern.trim()) return null
  const r = tryCompile(rule.pattern, rule.caseSensitive)
  return 'error' in r ? r.error : null
}

/** Grammar Hammer: slop constructions matched by POS patterns, stripped or flagged inside Second
 *  Pass. No Enable of its own: the rules run when Second Pass is on, and that toggle lives on the
 *  Setup tab. */
export default function GrammarHammerPanel() {
  const gh = useSecondPass()
  const patchGh = useSettings((s) => s.setSecondPass)
  const [cheat, setCheat] = useState(false)

  const patchRule = (id: string, patch: Partial<GrammarHammerRule>) =>
    patchGh({ rules: gh.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })

  return (
    <section className="textRules grammarHammer screenFrame">
      <span className="titleContainer">
        <h3>
          <RiHammerLine size={14} className="hammerIcon" /> Grammar Hammer
        </h3>
      </span>

      {!gh.enabled && <p className="hint">Second Pass is off. Turn it on in Setup.</p>}

      <ul className="ruleCards screenBody">
        {gh.rules.map((rule) => {
          const error = ruleError(rule)
          return (
            <li key={rule.id} className="card ruleCard">
              <RuleCardHead
                enabled={rule.enabled}
                label={rule.label ?? ''}
                scope={rule.scope}
                onChange={(patch) => patchRule(rule.id, patch)}
                onCopy={() => {
                  const i = gh.rules.findIndex((r) => r.id === rule.id)
                  patchGh({ rules: gh.rules.toSpliced(i + 1, 0, { ...rule, id: crypto.randomUUID() }) })
                }}
                onDelete={() => patchGh({ rules: gh.rules.filter((r) => r.id !== rule.id) })}
              />
              <label className="ruleField">
                <span>Pattern</span>
                <input
                  className="patternInput"
                  value={rule.pattern}
                  placeholder="with a [adj] [noun]"
                  onChange={(e) => patchRule(rule.id, { pattern: e.target.value })}
                />
              </label>
              <div className="ruleField">
                <span>Action</span>
                <div className="ruleActionRow">
                  <select
                    value={rule.action}
                    onChange={(e) => patchRule(rule.id, { action: e.target.value as GrammarHammerRule['action'] })}
                  >
                    <option value="strip">Remove match</option>
                    <option value="replace">Replace with…</option>
                    <option value="flag">Report to the model</option>
                  </select>
                  {rule.action === 'replace' && (
                    <input
                      className="patternInput"
                      value={rule.replacement ?? ''}
                      placeholder="It's not $1, but $2..."
                      onChange={(e) => patchRule(rule.id, { replacement: e.target.value })}
                    />
                  )}
                </div>
              </div>
              {error && <p className="hint danger">{error}</p>}
            </li>
          )
        })}
      </ul>

      <div className="grammarActions">
        <button type="button" onClick={() => patchGh({ rules: [...gh.rules, newGrammarHammerRule()] })}>
          Add rule
        </button>
        <button type="button" onClick={() => setCheat(!cheat)}>
          {cheat ? 'Hide cheat sheet' : 'Cheat sheet'}
        </button>
      </div>

      {cheat && (
        <div className="panel cheatSheet">
          <p>
            <strong>POS slots:</strong> {POS_TAGS.map((t) => `[${t}]`).join(' ')}
          </p>
          <p>
            <strong>[word]</strong> matches any one word.
          </p>
          <p>
            <strong>Quantifiers:</strong> <code>[adj]?</code> optional · <code>[adj]+</code> one or more ·{' '}
            <code>[adj]{'{2}'}</code> exactly two · <code>[adj]{'{1,3}'}</code> one to three ·{' '}
            <code>[adj]{'{2,}'}</code> two or more
          </p>
          <p>Literal tokens match the surface word, case-insensitive unless the rule opts in.</p>
          <p>
            <strong>Replace refs:</strong> <code>$0</code> whole match ·{' '}
            <code>$1</code>…<code>$n</code> each pattern token in order
          </p>
        </div>
      )}

    </section>
  )
}
