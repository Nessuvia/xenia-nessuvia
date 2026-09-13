import { useState } from 'react'
import { RiTextSnippet } from '@remixicon/react'
import type { DetectSettings } from '../../core/secondSweep/detectSettings'
import { newRule, type Rule } from '../../core/secondSweep/rules'
import RuleCardHead from './RuleCardHead'
import { tryCompile, POS_TAGS } from '../../core/hammer/pattern'
import './settings.css'

/** The syntax error for a rule's find, or null. A literal is escaped and cannot fail. */
function ruleError(rule: Rule): string | null {
  const find = rule.find.trim()
  if (!find) return null
  if (rule.match === 'pattern') {
    const r = tryCompile(find, rule.caseSensitive)
    return 'error' in r ? r.error : null
  }
  if (rule.match !== 'regex') return null
  try {
    new RegExp(rule.find)
    return null
  } catch (err) {
    return (err as Error).message
  }
}

const modeHints: Record<Rule['match'], string> = {
  literal: 'Matches the words as typed.',
  regex: 'A JS regular expression. It can match across a sentence break.',
  pattern: 'Matches parts of speech. Never crosses a sentence break.',
}

/**
 * The pipeline's detection rules: what to look for in a reply, and what to do about it.
 *
 * One list where there were two. A rule used to be either a Grammar Hammer rule, matching parts of
 * speech and able to edit the text, or a free-text rule, matching a string and only able to report.
 * They are the same thing with two knobs: how the find is read, and what happens to a match.
 *
 * Prop-driven: the rules belong to a pipeline record, and the panel edits whichever one is open.
 */
export default function RulesPanel({
  detect,
  patch,
}: {
  detect: DetectSettings
  patch: (over: Partial<DetectSettings>) => void
}) {
  const rules = detect.rules
  const [cheat, setCheat] = useState(false)

  const patchRule = (id: string, over: Partial<Rule>) =>
    patch({ rules: rules.map((r) => (r.id === id ? { ...r, ...over } : r)) })

  return (
    <section className="textRules screenFrame">
      <span className="titleContainer">
        <h3>
          <RiTextSnippet size={14} className="hammerIcon" /> Rules
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
                  patch({ rules: rules.toSpliced(i + 1, 0, { ...rule, id: crypto.randomUUID() }) })
                }}
                onDelete={() => patch({ rules: rules.filter((r) => r.id !== rule.id) })}
              />

              <label className="ruleField">
                <span>Find</span>
                <input
                  className="patternInput"
                  value={rule.find}
                  placeholder={
                    rule.match === 'pattern'
                      ? 'with a [adj] [noun]'
                      : 'Leave blank to apply to every reply'
                  }
                  onChange={(e) => patchRule(rule.id, { find: e.target.value })}
                />
              </label>

              {rule.find ? (
                <div className="ruleField">
                  <span>Match</span>
                  <div className="ruleActionRow">
                    <select
                      value={rule.match}
                      onChange={(e) =>
                        patchRule(rule.id, { match: e.target.value as Rule['match'] })
                      }
                    >
                      <option value="literal">Words</option>
                      <option value="regex">Regex</option>
                      <option value="pattern">Word types</option>
                    </select>
                    <label className="checkboxRow">
                      <input
                        type="checkbox"
                        checked={rule.caseSensitive}
                        onChange={(e) => patchRule(rule.id, { caseSensitive: e.target.checked })}
                      />
                      Match case
                    </label>
                  </div>
                  <p className="hint">{modeHints[rule.match]}</p>
                </div>
              ) : (
                <p className="hint">Applies to every reply.</p>
              )}

              {rule.find && (
                <div className="ruleField">
                  <span>Action</span>
                  <div className="ruleActionRow">
                    <select
                      value={rule.action}
                      onChange={(e) =>
                        patchRule(rule.id, { action: e.target.value as Rule['action'] })
                      }
                    >
                      <option value="flag">Report to the model</option>
                      <option value="strip">Remove match</option>
                      <option value="replace">Replace with…</option>
                    </select>
                    {rule.action === 'replace' && (
                      <input
                        className="patternInput"
                        value={rule.replacement ?? ''}
                        placeholder="It's not $1, but $2…"
                        onChange={(e) => patchRule(rule.id, { replacement: e.target.value })}
                      />
                    )}
                  </div>
                </div>
              )}

              {(rule.action === 'flag' || !rule.find) && (
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
              )}

              {error && <p className="hint danger">{error}</p>}
            </li>
          )
        })}
        {rules.length === 0 && <p className="hint">No rules.</p>}
      </ul>

      <div className="grammarActions">
        <button type="button" onClick={() => patch({ rules: [...rules, newRule()] })}>
          Add rule
        </button>
        <button type="button" onClick={() => setCheat(!cheat)}>
          {cheat ? 'Hide cheat sheet' : 'Cheat sheet'}
        </button>
      </div>

      {cheat && (
        <div className="panel cheatSheet">
          <p>
            <strong>Word-type slots:</strong> {POS_TAGS.map((t) => `[${t}]`).join(' ')}
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
            <code>$1</code>…<code>$n</code> each group in order
          </p>
        </div>
      )}
    </section>
  )
}
