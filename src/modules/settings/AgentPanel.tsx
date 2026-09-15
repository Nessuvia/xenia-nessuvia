import { useEffect, useMemo, useState } from 'react'
import { RiDeleteBinLine } from '@remixicon/react'
import { useSettings } from '../../core/stores/settingsStore'
import type { AgentStyle } from '../../core/agent/agentConfig'
import { newLexiconEntry, type LexiconEntry } from '../../core/quality/lexicon'
import { explainAgent, type ExplainedOperation } from '../../core/agent/explain'
import { defaultLintConfig, lintRules, type LintConfig, type LintProfile } from '../../core/agent/lintRules'
import { arousalLoaded, loadArousal } from '../../core/quality/arousal'
import ConnectionPicker from '../../app/ConnectionPicker'
import RulesPanel from './RulesPanel'
import './settings.css'

const operationLabels: Record<ExplainedOperation, string> = {
  keep: 'Keep',
  rewriteSentence: 'Rewrite sentence',
  rewriteParagraph: 'Rewrite paragraph',
  delete: 'Delete',
}

/** The global post-processing config, in the order the stages run, and a tester. */
export default function AgentPanel() {
  const agent = useSettings((s) => s.agent)
  const setAgent = useSettings((s) => s.setAgent)
  const [sample, setSample] = useState('')
  const lint = agent.lint ?? defaultLintConfig
  // The tester scores temperature synchronously, so it re-runs once the lexicon chunk arrives.
  const [loaded, setLoaded] = useState(arousalLoaded)
  useEffect(() => {
    if (lint.enabled && !loaded) loadArousal().then(() => setLoaded(true))
  }, [lint.enabled, loaded])
  const explained = useMemo(() => (sample.trim() ? explainAgent(sample, agent) : null), [sample, agent, loaded])

  const patchEntry = (id: string, over: Partial<LexiconEntry>) =>
    setAgent({ lexicon: agent.lexicon.map((e) => (e.id === id ? { ...e, ...over } : e)) })
  const patchLint = (over: Partial<LintConfig>) => setAgent({ lint: { ...lint, ...over } })

  return (
    <div className="passPanel screenBody">
      <section className="settingsCard">
        <h3>Post-processing</h3>
        <p className="debugHint">Runs on a finished reply in this order: word swaps, style checks, rules.</p>
        <label className="checkboxRow">
          <input type="checkbox" checked={agent.enabled} onChange={(e) => setAgent({ enabled: e.target.checked })} />
          Run on every reply
        </label>
        <p className="debugHint">A chat can override this in its sidebar.</p>
        <label className="settingsAgentTries">
          Style
          <select value={agent.style ?? 'stylized'} onChange={(e) => setAgent({ style: e.target.value as AgentStyle })}>
            <option value="stylized">Stylized</option>
            <option value="default">Default</option>
          </select>
        </label>
        <p className="debugHint">Stylized shows each edit as it happens. Default uses each chat's display setting.</p>
        <ConnectionPicker value={agent.connectionId} allowActive onChange={(connectionId) => setAgent({ connectionId })} />
        <label className="settingsAgentTries" title="Rejected rewrites allowed before the original stays.">
          Tries
          <input
            type="number"
            min={1}
            max={10}
            value={agent.maxTries}
            onChange={(e) => setAgent({ maxTries: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
      </section>

      <section className="settingsCard">
        <h3>Tester</h3>
        <textarea
          className="settingsAgentSample"
          rows={6}
          value={sample}
          placeholder="Paste a reply."
          onChange={(e) => setSample(e.target.value)}
        />
        {explained && explained.swapped !== sample && <p className="debugHint">After word swaps: {explained.swapped}</p>}
        {explained && explained.lint.length > 0 && (
          <>
            {explained.linted !== explained.swapped && <p className="debugHint">After style checks: {explained.linted}</p>}
            <ul className="settingsAgentResults">
              {explained.lint.map((hit, i) => (
                <li key={i} className="settingsAgentResult settingsAgentResultHit">
                  <span>{hit.note}</span>
                  <span className="debugHint">{lintRules.find((r) => r.id === hit.ruleId)?.label}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {explained && (
          <ul className="settingsAgentResults">
            {explained.sentences.map((s, i) => (
              <li key={i} className={s.operation === 'keep' ? 'settingsAgentResult' : 'settingsAgentResult settingsAgentResultHit'}>
                <span>{s.text}</span>
                <span className="debugHint">
                  {operationLabels[s.operation]}
                  {s.rules.length > 0 && ` · ${s.rules.join(', ')}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="settingsCard">
        <h3>1. Word swaps</h3>
        <p className="debugHint">Runs in code. A blank replacement removes the phrase.</p>
        <ul className="settingsAgentLexicon">
          {agent.lexicon.map((entry) => (
            <li key={entry.id} className="settingsAgentLexiconRow">
              <input type="checkbox" checked={entry.enabled} onChange={(e) => patchEntry(entry.id, { enabled: e.target.checked })} />
              <input value={entry.phrase} placeholder="utilize" onChange={(e) => patchEntry(entry.id, { phrase: e.target.value })} />
              <input value={entry.replacement} placeholder="use" onChange={(e) => patchEntry(entry.id, { replacement: e.target.value })} />
              <button
                type="button"
                className="danger"
                title="Delete"
                aria-label="Delete"
                onClick={() => setAgent({ lexicon: agent.lexicon.filter((e) => e.id !== entry.id) })}
              >
                <RiDeleteBinLine size={16} />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setAgent({ lexicon: [...agent.lexicon, newLexiconEntry()] })}>
          Add swap
        </button>
      </section>

      <section className="settingsCard">
        <h3>2. Style checks</h3>
        <p className="debugHint">Runs in code, once per reply. Word arousal scores come from the NRC VAD Lexicon (Saif M. Mohammad, NRC Canada).</p>
        <label className="checkboxRow">
          <input type="checkbox" checked={lint.enabled} onChange={(e) => patchLint({ enabled: e.target.checked })} />
          Run style checks
        </label>
        <label className="settingsAgentTries">
          On a hit
          <select value={lint.mode} onChange={(e) => patchLint({ mode: e.target.value as LintConfig['mode'] })}>
            <option value="report">List it in the summary</option>
            <option value="fix">Fix it</option>
          </select>
        </label>
        <label className="settingsAgentTries" title="Sets how many intensifiers a paragraph may keep.">
          Rates
          <select value={lint.profile} onChange={(e) => patchLint({ profile: e.target.value as LintProfile })}>
            <option value="fiction">Published fiction</option>
            <option value="fanfic">Fanfic</option>
          </select>
        </label>
        <ul className="settingsAgentLexicon">
          {lintRules.map((rule) => (
            <li key={rule.id}>
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={!lint.off.includes(rule.id)}
                  onChange={(e) =>
                    patchLint({ off: e.target.checked ? lint.off.filter((id) => id !== rule.id) : [...lint.off, rule.id] })
                  }
                />
                {rule.label}
              </label>
              <p className="debugHint">{rule.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <RulesPanel rules={agent.rules} onChange={(rules) => setAgent({ rules })} />
    </div>
  )
}
