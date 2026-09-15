import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RiAddLine, RiDeleteBinLine, RiDownloadLine, RiFileCopyLine, RiStarFill, RiUploadLine } from '@remixicon/react'
import { useAppearance, useSettings } from '../../core/stores/settingsStore'
import { usePostStacks } from '../../core/stores/postStackStore'
import { defaultPostStackConfig, runStages, type PostStackConfig } from '../../core/agent/postStack'
import type { AgentStyle } from '../../core/agent/agentConfig'
import { newLexiconEntry, type LexiconEntry } from '../../core/quality/lexicon'
import type { IgnorePair } from '../../core/hammer/exclusions'
import { explainAgent, type ExplainedOperation } from '../../core/agent/explain'
import { lintRules, type LintConfig, type LintProfile } from '../../core/agent/lintRules'
import { arousalLoaded, loadArousal } from '../../core/quality/arousal'
import ConnectionPicker from '../../app/ConnectionPicker'
import RulesPanel from './RulesPanel'
import { exportPostStack, parsePostStack } from './postStackFile'
import './postProcessing.css'

const operationLabels: Record<ExplainedOperation, string> = {
  keep: 'Keep',
  rewriteSentence: 'Rewrite sentence',
  rewriteParagraph: 'Rewrite paragraph',
  delete: 'Delete',
}

/** The stages, in the order the pass runs them. */
type StageId = 'acrostic' | 'swaps' | 'lint' | 'rules' | 'ignore'

export default function PostProcessingView() {
  const agent = useSettings((s) => s.agent)
  const setAgent = useSettings((s) => s.setAgent)
  const { stacks, load, create, duplicate, remove, rename, patchConfig, save, usage } = usePostStacks()
  const tagRules = useAppearance().tagRules
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [open, setOpen] = useState<StageId | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
    usage().then(setCounts)
  }, [load, usage])

  const stack = stacks.find((s) => s.id === selectedId) ?? stacks.find((s) => s.id === agent.defaultStackId) ?? stacks[0]
  const config = stack?.config ?? defaultPostStackConfig()
  const patch = (over: Partial<PostStackConfig>) => stack?.id && patchConfig(stack.id, over)
  const toggle = (id: StageId) => setOpen(open === id ? null : id)

  const importFile = async (file: File) => {
    try {
      const id = await save(parsePostStack(await file.text()))
      setSelectedId(id)
      setError('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="postProcessing screenFrame">
      <h2>Post-processing</h2>

      <div className="postColumns screenBody">
        <section className="postStacks">
          <h3>Stacks</h3>
          <ul className="postStackList">
            {stacks.map((s) => (
              <li
                key={s.id}
                className={`card postStackRow${s.id === stack?.id ? ' active' : ''}`}
                onClick={() => setSelectedId(s.id!)}
              >
                <input
                  className="postStackName"
                  value={s.name}
                  onChange={(e) => rename(s.id!, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  type="button"
                  className={`postStackStar${s.id === agent.defaultStackId ? ' current' : ''}`}
                  title={s.id === agent.defaultStackId ? 'The default stack' : 'Make it the default'}
                  aria-label="Make it the default"
                  onClick={(e) => {
                    e.stopPropagation()
                    setAgent({ defaultStackId: s.id! })
                  }}
                >
                  <RiStarFill size={14} />
                </button>
                <span className="postStackUsed">
                  {counts[s.id!] ? `Used by ${counts[s.id!]} ${counts[s.id!] === 1 ? 'chat' : 'chats'}` : 'Used by no chats'}
                </span>
                <span className="postStackActions">
                  <button
                    type="button"
                    title="Duplicate"
                    aria-label="Duplicate"
                    onClick={(e) => {
                      e.stopPropagation()
                      duplicate(s.id!).then(setSelectedId)
                    }}
                  >
                    <RiFileCopyLine size={14} />
                  </button>
                  <button
                    type="button"
                    title="Export"
                    aria-label="Export"
                    onClick={(e) => {
                      e.stopPropagation()
                      exportPostStack(s)
                    }}
                  >
                    <RiDownloadLine size={14} />
                  </button>
                  <button
                    type="button"
                    className="danger"
                    title="Delete"
                    aria-label="Delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(s.id!)
                      if (selectedId === s.id) setSelectedId(null)
                    }}
                  >
                    <RiDeleteBinLine size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <div className="postStackButtons">
            <button type="button" onClick={() => create().then(setSelectedId)}>
              <RiAddLine size={14} /> New
            </button>
            <label className="postStackImport">
              <RiUploadLine size={14} /> Import
              <input
                type="file"
                accept="application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) importFile(file)
                }}
              />
            </label>
          </div>
          {error && <p className="hint danger">{error}</p>}
        </section>

        <section className="postPipeline">
          <div className="postGlobal">
            <label className="checkboxRow">
              <input type="checkbox" checked={agent.enabled} onChange={(e) => setAgent({ enabled: e.target.checked })} />
              Run on every reply
            </label>
            <label className="postGlobalField">
              Style
              <select value={agent.style ?? 'stylized'} onChange={(e) => setAgent({ style: e.target.value as AgentStyle })}>
                <option value="stylized">Stylized</option>
                <option value="default">Default</option>
              </select>
            </label>
            <ConnectionPicker value={agent.connectionId} allowActive onChange={(connectionId) => setAgent({ connectionId })} />
          </div>
          <p className="hint">These three apply to every stack. A chat can override the switch in its sidebar.</p>

          {!stack ? (
            <p className="hint">No stacks. Add one to edit the pass.</p>
          ) : (
            <>
              <div className="postStageSummary">
                <span className="postChip">{config.acrostic.enabled ? 'Acrostic on' : 'Acrostic off'}</span>
                <span className="postChip">{config.swaps.lexicon.length} swaps</span>
                <span className="postChip">{lintRules.length - config.lint.off.length} checks</span>
                <span className="postChip">{config.rules.list.length} rules</span>
                {config.ignore.enabled && (
                  <span className="postChip">
                    ignoring {config.ignore.pairs.length + (config.ignore.useTagRules ? tagRules.length : 0)} pairs
                  </span>
                )}
              </div>

              <ul className="postStages">
                <StageHead
                  id="acrostic"
                  title="Acrostic"
                  summary={`Every reply · ${config.acrostic.beatSlots} beat`}
                  enabled={config.acrostic.enabled}
                  open={false}
                  onToggleEnabled={(enabled) => patch({ acrostic: { ...config.acrostic, enabled } })}
                />
                <StageHead
                  id="swaps"
                  title="Word swaps"
                  summary={`${config.swaps.lexicon.length} swaps`}
                  enabled={config.swaps.enabled}
                  open={open === 'swaps'}
                  onOpen={() => toggle('swaps')}
                  onToggleEnabled={(enabled) => patch({ swaps: { ...config.swaps, enabled } })}
                >
                  <SwapsEditor
                    lexicon={config.swaps.lexicon}
                    onChange={(lexicon) => patch({ swaps: { ...config.swaps, lexicon } })}
                  />
                </StageHead>
                <StageHead
                  id="lint"
                  title="Style checks"
                  summary={`${lintRules.length - config.lint.off.length} on · ${config.lint.mode === 'fix' ? 'fix' : 'report'}`}
                  enabled={config.lint.enabled}
                  open={open === 'lint'}
                  onOpen={() => toggle('lint')}
                  onToggleEnabled={(enabled) => patch({ lint: { ...config.lint, enabled } })}
                >
                  <LintEditor lint={config.lint} onChange={(lint) => patch({ lint })} />
                </StageHead>
                <StageHead
                  id="rules"
                  title="Rules"
                  summary={`${config.rules.list.length} rules`}
                  enabled={config.rules.enabled}
                  open={open === 'rules'}
                  onOpen={() => toggle('rules')}
                  onToggleEnabled={(enabled) => patch({ rules: { ...config.rules, enabled } })}
                >
                  <RulesPanel rules={config.rules.list} onChange={(list) => patch({ rules: { ...config.rules, list } })} />
                </StageHead>
              </ul>

              <section className="card postStage">
                <div className="postStageHead">
                  <input
                    type="checkbox"
                    className="postStageSwitch"
                    checked={config.ignore.enabled}
                    aria-label="Ignore text in tags"
                    onChange={(e) => patch({ ignore: { ...config.ignore, enabled: e.target.checked } })}
                  />
                  <button type="button" className="postStageTitle" onClick={() => toggle('ignore')}>
                    Ignored text
                  </button>
                  <span className="postStageCount">{config.ignore.pairs.length} pairs</span>
                </div>
                {open === 'ignore' && (
                  <div className="postStageBody">
                    <p className="hint">
                      Text between these pairs is left alone by every stage. Code spans and links are always
                      skipped.
                    </p>
                    <IgnoreEditor
                      pairs={config.ignore.pairs}
                      onChange={(pairs) => patch({ ignore: { ...config.ignore, pairs } })}
                    />
                    <label className="checkboxRow">
                      <input
                        type="checkbox"
                        checked={config.ignore.useTagRules}
                        onChange={(e) => patch({ ignore: { ...config.ignore, useTagRules: e.target.checked } })}
                      />
                      Ignore Tags
                    </label>
                    <p className="hint">
                      Also skip the {tagRules.length} {tagRules.length === 1 ? 'tag' : 'tags'} set up in{' '}
                      <Link to="/settings#textRules">Settings, Text, Tags</Link>. Those are global, so every stack
                      that ticks this gets the same list.
                    </p>
                  </div>
                )}
              </section>

              <label className="postGlobalField" title="Rejected rewrites allowed before the original stays.">
                Tries
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={config.maxTries}
                  onChange={(e) => patch({ maxTries: Math.max(1, Number(e.target.value) || 1) })}
                />
              </label>
            </>
          )}
        </section>

        <Tester config={config} />
      </div>
    </div>
  )
}

/** A stage row: its switch, its summary, and its editor when open. A stage with no editor yet
 *  renders as a header alone. */
function StageHead({
  title,
  summary,
  enabled,
  open,
  onOpen,
  onToggleEnabled,
  children,
}: {
  id: StageId
  title: string
  summary: string
  enabled: boolean
  open: boolean
  onOpen?: () => void
  onToggleEnabled: (enabled: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <li className="card postStage">
      <div className="postStageHead">
        <input
          type="checkbox"
          className="postStageSwitch"
          checked={enabled}
          aria-label={`Run ${title}`}
          onChange={(e) => onToggleEnabled(e.target.checked)}
        />
        <button type="button" className="postStageTitle" disabled={!onOpen} onClick={onOpen}>
          {title}
        </button>
        <span className="postStageCount">{summary}</span>
      </div>
      {open && <div className="postStageBody">{children}</div>}
    </li>
  )
}

function SwapsEditor({ lexicon, onChange }: { lexicon: LexiconEntry[]; onChange: (list: LexiconEntry[]) => void }) {
  const patchEntry = (id: string, over: Partial<LexiconEntry>) =>
    onChange(lexicon.map((e) => (e.id === id ? { ...e, ...over } : e)))
  return (
    <>
      <p className="hint">Runs in code. A blank replacement removes the phrase.</p>
      <ul className="postSwapList">
        {lexicon.map((entry) => (
          <li key={entry.id} className="postSwapRow">
            <input type="checkbox" checked={entry.enabled} onChange={(e) => patchEntry(entry.id, { enabled: e.target.checked })} />
            <input value={entry.phrase} placeholder="utilize" onChange={(e) => patchEntry(entry.id, { phrase: e.target.value })} />
            <input value={entry.replacement} placeholder="use" onChange={(e) => patchEntry(entry.id, { replacement: e.target.value })} />
            <button
              type="button"
              className="danger"
              title="Delete"
              aria-label="Delete"
              onClick={() => onChange(lexicon.filter((e) => e.id !== entry.id))}
            >
              <RiDeleteBinLine size={16} />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onChange([...lexicon, newLexiconEntry()])}>
        Add swap
      </button>
    </>
  )
}

/** The delimiter pairs whose contents the pass skips. Same row shape as the swaps editor. */
function IgnoreEditor({ pairs, onChange }: { pairs: IgnorePair[]; onChange: (pairs: IgnorePair[]) => void }) {
  const patchPair = (id: string, over: Partial<IgnorePair>) =>
    onChange(pairs.map((p) => (p.id === id ? { ...p, ...over } : p)))
  return (
    <>
      <ul className="postSwapList">
        {pairs.map((pair) => (
          <li key={pair.id} className="postSwapRow">
            <input value={pair.open} placeholder="[" onChange={(e) => patchPair(pair.id, { open: e.target.value })} />
            <input value={pair.close} placeholder="]" onChange={(e) => patchPair(pair.id, { close: e.target.value })} />
            <button
              type="button"
              className="danger"
              title="Delete"
              aria-label="Delete"
              onClick={() => onChange(pairs.filter((p) => p.id !== pair.id))}
            >
              <RiDeleteBinLine size={16} />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onChange([...pairs, { id: crypto.randomUUID(), open: '', close: '' }])}>
        Add pair
      </button>
    </>
  )
}

function LintEditor({ lint, onChange }: { lint: LintConfig; onChange: (lint: LintConfig) => void }) {
  const patch = (over: Partial<LintConfig>) => onChange({ ...lint, ...over })
  return (
    <>
      <p className="hint">Runs in code, once per reply. Word arousal scores come from the NRC VAD Lexicon (Saif M. Mohammad, NRC Canada).</p>
      <label className="postGlobalField">
        On a hit
        <select value={lint.mode} onChange={(e) => patch({ mode: e.target.value as LintConfig['mode'] })}>
          <option value="report">List it in the summary</option>
          <option value="fix">Fix it</option>
        </select>
      </label>
      <label className="postGlobalField" title="Sets how many intensifiers a paragraph may keep.">
        Rates
        <select value={lint.profile} onChange={(e) => patch({ profile: e.target.value as LintProfile })}>
          <option value="fiction">Published fiction</option>
          <option value="fanfic">Fanfic</option>
        </select>
      </label>
      <ul className="postLintList">
        {lintRules.map((rule) => (
          <li key={rule.id}>
            <label className="checkboxRow">
              <input
                type="checkbox"
                checked={!lint.off.includes(rule.id)}
                onChange={(e) => patch({ off: e.target.checked ? lint.off.filter((id) => id !== rule.id) : [...lint.off, rule.id] })}
              />
              {rule.label}
            </label>
            <p className="hint">{rule.description}</p>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Pasted text, run through the stack with no request. Step 6 of the v2 plan replaces this with a
 *  run over a chat's replies, with per-rule hit counts. */
function Tester({ config }: { config: PostStackConfig }) {
  const [sample, setSample] = useState('')
  const tagRules = useAppearance().tagRules
  const run = useMemo(() => runStages(config, tagRules), [config, tagRules])
  const [loaded, setLoaded] = useState(arousalLoaded)
  const lintOn = config.lint.enabled
  useEffect(() => {
    if (lintOn && !loaded) loadArousal().then(() => setLoaded(true))
  }, [lintOn, loaded])
  const explained = useMemo(() => (sample.trim() ? explainAgent(sample, run) : null), [sample, run, loaded])

  return (
    <section className="postTester">
      <h3>Tester</h3>
      <textarea className="postTesterSample" rows={6} value={sample} placeholder="Paste a reply." onChange={(e) => setSample(e.target.value)} />
      {explained && explained.swapped !== sample && <p className="hint">After word swaps: {explained.swapped}</p>}
      {explained && explained.lint.length > 0 && (
        <>
          {explained.linted !== explained.swapped && <p className="hint">After style checks: {explained.linted}</p>}
          <ul className="postTesterResults">
            {explained.lint.map((hit, i) => (
              <li key={i} className="postTesterResult postTesterHit">
                <span>{hit.note}</span>
                <span className="hint">{lintRules.find((r) => r.id === hit.ruleId)?.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {explained && (
        <ul className="postTesterResults">
          {explained.sentences.map((s, i) => (
            <li key={i} className={s.operation === 'keep' ? 'postTesterResult' : 'postTesterResult postTesterHit'}>
              <span>{s.text}</span>
              <span className="hint">
                {operationLabels[s.operation]}
                {s.rules.length > 0 && ` · ${s.rules.join(', ')}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
