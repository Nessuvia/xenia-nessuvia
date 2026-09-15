import { useState } from 'react'
import { RiAddLine, RiDeleteBinLine, RiFileCopyLine, RiSearchLine, RiTextSnippet } from '@remixicon/react'
import { actionHints, actionLabels, newRule, type Rule } from '../../core/agent/rules'
import RuleCardHead from './RuleCardHead'
import RuleBuilder from './RuleBuilder'
import { tryCompile, POS_TAGS } from '../../core/hammer/pattern'
// The rule-card CSS still lives in the settings stylesheet, which the Settings panels share. The
// builder's own classes are in postProcessing.css.
import '../settings/settings.css'

/** The syntax error for a rule's find, or null. */
function ruleError(rule: Rule): string | null {
  const find = rule.find.trim()
  if (!find) return null
  if (rule.match === 'pattern') {
    const r = tryCompile(find, rule.caseSensitive)
    return 'error' in r ? r.error : null
  }
  try {
    new RegExp(find)
    return null
  } catch (err) {
    return (err as Error).message
  }
}

/** In the order the pass runs them. */
const groups: [Rule['action'], string][] = [
  ['swap', 'Swap'],
  ['delete', 'Delete'],
  ['rewrite', 'Rewrite'],
]

/** A rule's body mounts when it opens and remounts when an action change moves it to another group. */
const scrollNearest = (el: HTMLElement | null) => el?.scrollIntoView({ block: 'nearest' })

/** The agent's rules: what to look for in a reply, and what the agent does about it. */
export default function RulesPanel({
  rules,
  onChange,
  openId,
  onOpen,
  counts,
}: {
  rules: Rule[]
  onChange: (rules: Rule[]) => void
  /** The one open rule. Owned by the view: the tester highlights only its hits, and a click on a hit opens one. */
  openId: string | null
  onOpen: (id: string | null) => void
  /** Tester hits by `rule:<id>`. Undefined until the tester has run. */
  counts?: Record<string, number>
}) {
  const [cheat, setCheat] = useState(false)
  const [query, setQuery] = useState('')

  const patchRule = (id: string, over: Partial<Rule>) => onChange(rules.map((r) => (r.id === id ? { ...r, ...over } : r)))

  const q = query.trim().toLowerCase()
  const shown = q
    ? rules.filter((r) => [r.label, r.sample, r.find].some((s) => (s ?? '').toLowerCase().includes(q)))
    : rules

  const addRule = (action: Rule['action']) => {
    const rule = { ...newRule(), action }
    onChange([...rules, rule])
    onOpen(rule.id)
    setQuery('')
  }

  const ruleItem = (rule: Rule) => {
    const error = ruleError(rule)
    const open = openId === rule.id
    return (
      <li key={rule.id} className={`card ruleCard${counts && !counts[`rule:${rule.id}`] ? ' postRuleNoHits' : ''}`}>
        <RuleCardHead
          enabled={rule.enabled}
          hits={counts && (counts[`rule:${rule.id}`] ?? 0)}
          label={rule.label ?? ''}
          placeholder={rule.sample || 'Untitled rule'}
          error={error}
          open={open}
          onChange={(over) => patchRule(rule.id, over)}
          onToggle={() => onOpen(open ? null : rule.id)}
        />
        {open && (
          <div className="ruleCardBody" ref={scrollNearest}>
            {rule.match === 'regex' ? (
              <label className="ruleField">
                <span>Regex</span>
                <input
                  className="patternInput"
                  value={rule.find}
                  placeholder="\bpool(?:ed|ing)\b"
                  onChange={(e) => patchRule(rule.id, { find: e.target.value })}
                />
              </label>
            ) : rule.sample === undefined ? (
              <label className="ruleField">
                <span>Pattern</span>
                <input
                  className="patternInput"
                  value={rule.find}
                  placeholder="with a [adj] [noun]"
                  onChange={(e) => patchRule(rule.id, { find: e.target.value })}
                />
              </label>
            ) : (
              <RuleBuilder rule={rule} onChange={(over) => patchRule(rule.id, over)} />
            )}

            <label className="checkboxRow">
              <input
                type="checkbox"
                checked={rule.caseSensitive}
                onChange={(e) => patchRule(rule.id, { caseSensitive: e.target.checked })}
              />
              Match case
            </label>

            <div className="ruleField">
              <span>Action</span>
              <div className="ruleActionRow">
                <select
                  value={rule.action}
                  onChange={(e) => patchRule(rule.id, { action: e.target.value as Rule['action'] })}
                >
                  {actionLabels.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                {rule.action === 'swap' && (
                  <input
                    className="patternInput"
                    value={rule.replacement ?? ''}
                    placeholder="Blank removes the match"
                    onChange={(e) => patchRule(rule.id, { replacement: e.target.value })}
                  />
                )}
                {rule.action === 'rewrite' && (
                  <label className="checkboxRow">
                    <input
                      type="checkbox"
                      checked={!!rule.wholeParagraph}
                      onChange={(e) => patchRule(rule.id, { wholeParagraph: e.target.checked })}
                    />
                    Rewrite the paragraph
                  </label>
                )}
              </div>
              <p className="hint">{actionHints[rule.action]}</p>
              {rule.action === 'swap' && (
                <p className="hint">$0 is the whole match. $1 onward are the numbered words above.</p>
              )}
            </div>

            {rule.action === 'rewrite' && (
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

            <div className="ruleCardFoot">
              <button
                type="button"
                title="Copy"
                aria-label="Copy"
                onClick={() => {
                  const copy = { ...rule, id: crypto.randomUUID() }
                  const i = rules.findIndex((r) => r.id === rule.id)
                  onChange(rules.toSpliced(i + 1, 0, copy))
                  onOpen(copy.id)
                }}
              >
                <RiFileCopyLine size={16} />
              </button>
              <button
                type="button"
                className="danger"
                title="Delete"
                aria-label="Delete"
                onClick={() => onChange(rules.filter((r) => r.id !== rule.id))}
              >
                <RiDeleteBinLine size={16} />
              </button>
            </div>
          </div>
        )}
      </li>
    )
  }

  return (
    <section className="textRules screenFrame">
      <span className="titleContainer">
        <h3>
          <RiTextSnippet size={14} className="hammerIcon" /> 3. Rules
        </h3>
      </span>
      <p className="debugHint">Swap and delete run in code. Rewrite sends the sentence or paragraph to the model.</p>

      <label className="ruleSearch">
        <RiSearchLine size={16} className="ruleSearchIcon" />
        <input
          type="search"
          className="ruleSearchInput"
          value={query}
          placeholder="Search names and patterns"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <div className="ruleGroups screenBody">
        {groups.map(([action, title]) => {
          const inGroup = shown.filter((r) => r.action === action)
          if (q && inGroup.length === 0) return null
          return (
            <div key={action} className="ruleGroup">
              <div className="ruleGroupHead">
                <span className="ruleGroupTitle">{title}</span>
                <span className="ruleGroupCount">{inGroup.length}</span>
                <button
                  type="button"
                  className="ruleGroupAdd"
                  title={`Add ${title.toLowerCase()} rule`}
                  aria-label={`Add ${title.toLowerCase()} rule`}
                  onClick={() => addRule(action)}
                >
                  <RiAddLine size={16} />
                </button>
              </div>
              <ul className="ruleCards">{inGroup.map(ruleItem)}</ul>
            </div>
          )
        })}
        {q && shown.length === 0 && <p className="hint">No rules match.</p>}
      </div>

      <div className="grammarActions">
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
            <strong>[word]</strong> matches any one word. <strong>[clause]</strong> matches the rest of the clause,
            stopping at punctuation or the end of the sentence.
          </p>
          <p>
            <strong>Punctuation</strong> written on its own, <code>,</code> or <code>—</code>, has to be there.
            Punctuation stuck to a word is ignored, and marks between two parts are skipped.
          </p>
          <p>
            <strong>Contractions:</strong> <code>did not</code> matches "didn't", and <code>didn't</code> matches
            both. A match never covers half of one.
          </p>
          <p>
            <strong>Quantifiers:</strong> <code>[adj]?</code> optional · <code>[adj]+</code> one or more ·{' '}
            <code>[adj]{'{2}'}</code> exactly two · <code>[adj]{'{1,3}'}</code> one to three ·{' '}
            <code>[adj]{'{2,}'}</code> two or more
          </p>
          <p>Literal tokens match the surface word, case-insensitive unless the rule opts in.</p>
          <p>
            <strong>Replace refs:</strong> <code>$0</code> whole match ·{' '}
            <code>$1</code>…<code>$n</code> each part in order
          </p>
        </div>
      )}
    </section>
  )
}
