import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { RiAddLine, RiDeleteBinLine, RiDownloadLine, RiFileCopyLine, RiStarFill, RiUploadLine } from '@remixicon/react'
import { useAppearance, useSettings } from '../../core/stores/settingsStore'
import { usePostStacks } from '../../core/stores/postStackStore'
import { useChats } from '../../core/stores/chatStore'
import { passOriginalFor } from '../../core/stores/swipes'
import { defaultPostStackConfig, runStages, type AcrosticConfig, type PostStackConfig } from '../../core/agent/postStack'
import type { AgentStyle } from '../../core/agent/agentConfig'
import { newLexiconEntry, type LexiconEntry } from '../../core/quality/lexicon'
import type { IgnorePair } from '../../core/hammer/exclusions'
import { testReplies, type TesterHit } from '../../core/agent/explain'
import { lintRules, type LintConfig, type LintProfile } from '../../core/agent/lintRules'
import { ruleName } from '../../core/agent/rules'
import { loadArousal } from '../../core/quality/arousal'
import type { Chat } from '../../core/storage/types'
import ConnectionPicker from '../../app/ConnectionPicker'
import RulesPanel from './RulesPanel'
import { exportPostStack, parsePostStack } from './postStackFile'
import './postProcessing.css'

/** The stages, in the order the pass runs them. */
type StageId = 'acrostic' | 'swaps' | 'lint' | 'rules' | 'ignore'

/** Which stage a tester key belongs to. */
const stageOf: Record<string, StageId> = { swap: 'swaps', lint: 'lint', rule: 'rules' }

const splitKey = (key: string) => {
  const at = key.indexOf(':')
  return [key.slice(0, at), key.slice(at + 1)] as const
}

const scrollNearest = (el: HTMLElement | null) => el?.scrollIntoView({ block: 'nearest' })

const hitsLabel = (n: number) => (n === 1 ? '1 hit' : `${n} hits`)

export default function PostProcessingView() {
  const agent = useSettings((s) => s.agent)
  const setAgent = useSettings((s) => s.setAgent)
  const { stacks, load, create, duplicate, remove, rename, patchConfig, save, usage } = usePostStacks()
  const tagRules = useAppearance().tagRules
  // "Open in Post-processing" from a chat names the stack and the rule to land on.
  const target = useLocation().state as { stackId?: number; ruleId?: string } | null
  const [selectedId, setSelectedId] = useState<number | null>(target?.stackId ?? null)
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [open, setOpen] = useState<StageId | null>(target?.ruleId ? 'rules' : null)
  const [openRuleId, setOpenRuleId] = useState<string | null>(target?.ruleId ?? null)
  // A swap or style check a tester hit pointed at, scrolled into view.
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [error, setError] = useState('')

  // The tester: a chat's replies, and what the stack finds in them.
  const [replies, setReplies] = useState<string[] | null>(null)
  const [tested, setTested] = useState<ReturnType<typeof testReplies> | null>(null)

  useEffect(() => {
    load()
    usage().then(setCounts)
  }, [load, usage])

  const stack = stacks.find((s) => s.id === selectedId) ?? stacks.find((s) => s.id === agent.defaultStackId) ?? stacks[0]
  const config = useMemo(() => stack?.config ?? defaultPostStackConfig(), [stack])
  const ignore = useMemo(() => runStages(config, tagRules).ignore ?? [], [config, tagRules])
  const patch = (over: Partial<PostStackConfig>) => stack?.id && patchConfig(stack.id, over)
  const toggle = (id: StageId) => setOpen(open === id ? null : id)

  // Debounced: every keystroke in a rule re-runs the whole chat otherwise.
  useEffect(() => {
    if (!replies) return
    const timer = setTimeout(() => setTested(testReplies(replies, config, ignore)), 300)
    return () => clearTimeout(timer)
  }, [replies, config, ignore])

  const hits = tested?.counts
  const fired = (prefix: string, ids: string[]) => ids.filter((id) => hits?.[`${prefix}:${id}`]).length
  const firedNote = (prefix: string, ids: string[]) => (hits ? ` · ${fired(prefix, ids)} fired` : '')

  const nameOf = (key: string) => {
    const [kind, id] = splitKey(key)
    if (kind === 'swap') {
      const entry = config.swaps.lexicon.find((e) => e.id === id)
      return entry ? `Word swap: ${entry.phrase} → ${entry.replacement || 'removed'}` : id
    }
    if (kind === 'lint') return lintRules.find((r) => r.id === id)?.label ?? id
    const rule = config.rules.list.find((r) => r.id === id)
    if (!rule) return id
    return `${ruleName(rule)} · would ${rule.action === 'swap' ? 'replace' : rule.action}`
  }

  const pickHit = (key: string) => {
    const [kind, id] = splitKey(key)
    setOpen(stageOf[kind])
    if (kind === 'rule') setOpenRuleId(id)
    else setFocusKey(key)
  }

  const runTester = async (chatId: number) => {
    const messages = await useChats.getState().messagesOf(chatId)
    // The style checks' arousal term reads a lexicon that loads on demand.
    await loadArousal()
    // As the model wrote them: a reply the pass already cleaned would hide what the rules catch.
    setReplies(messages.filter((m) => m.role === 'assistant').map((m) => passOriginalFor(m) ?? m.content.slice(m.reasoningEnd ?? 0)))
  }

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
                  summary={`Every reply · ${config.acrostic.paragraphs.join('-')} paragraphs · ${config.acrostic.beatSlots} ${config.acrostic.beatSlots === 1 ? 'beat' : 'beats'}`}
                  enabled={config.acrostic.enabled}
                  open={open === 'acrostic'}
                  onOpen={() => toggle('acrostic')}
                  onToggleEnabled={(enabled) => patch({ acrostic: { ...config.acrostic, enabled } })}
                >
                  <AcrosticEditor acrostic={config.acrostic} onChange={(acrostic) => patch({ acrostic })} />
                </StageHead>
                <StageHead
                  id="swaps"
                  title="Word swaps"
                  summary={`${config.swaps.lexicon.length} swaps${firedNote('swap', config.swaps.lexicon.map((e) => e.id))}`}
                  enabled={config.swaps.enabled}
                  open={open === 'swaps'}
                  onOpen={() => toggle('swaps')}
                  onToggleEnabled={(enabled) => patch({ swaps: { ...config.swaps, enabled } })}
                >
                  <SwapsEditor
                    lexicon={config.swaps.lexicon}
                    hits={hits}
                    focusKey={focusKey}
                    onChange={(lexicon) => patch({ swaps: { ...config.swaps, lexicon } })}
                  />
                </StageHead>
                <StageHead
                  id="lint"
                  title="Style checks"
                  summary={`${lintRules.length - config.lint.off.length} on · ${config.lint.mode === 'fix' ? 'fix' : 'report'}${firedNote('lint', lintRules.map((r) => r.id))}`}
                  enabled={config.lint.enabled}
                  open={open === 'lint'}
                  onOpen={() => toggle('lint')}
                  onToggleEnabled={(enabled) => patch({ lint: { ...config.lint, enabled } })}
                >
                  <LintEditor lint={config.lint} hits={hits} focusKey={focusKey} onChange={(lint) => patch({ lint })} />
                </StageHead>
                <StageHead
                  id="rules"
                  title="Rules"
                  summary={`${config.rules.list.length} rules${firedNote('rule', config.rules.list.map((r) => r.id))}`}
                  enabled={config.rules.enabled}
                  open={open === 'rules'}
                  onOpen={() => toggle('rules')}
                  onToggleEnabled={(enabled) => patch({ rules: { ...config.rules, enabled } })}
                >
                  <RulesPanel
                    rules={config.rules.list}
                    openId={openRuleId}
                    onOpen={setOpenRuleId}
                    counts={hits}
                    onChange={(list) => patch({ rules: { ...config.rules, list } })}
                  />
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

        <Tester
          replies={replies}
          hits={tested?.hits ?? null}
          only={open === 'rules' && openRuleId ? `rule:${openRuleId}` : null}
          onlyName={openRuleId ? nameOf(`rule:${openRuleId}`) : ''}
          nameOf={nameOf}
          onRun={runTester}
          onPick={pickHit}
        />
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

function SwapsEditor({
  lexicon,
  hits,
  focusKey,
  onChange,
}: {
  lexicon: LexiconEntry[]
  hits?: Record<string, number>
  focusKey: string | null
  onChange: (list: LexiconEntry[]) => void
}) {
  const patchEntry = (id: string, over: Partial<LexiconEntry>) =>
    onChange(lexicon.map((e) => (e.id === id ? { ...e, ...over } : e)))
  return (
    <>
      <p className="hint">Runs in code. A blank replacement removes the phrase.</p>
      <ul className="postSwapList">
        {lexicon.map((entry) => (
          <li
            key={entry.id}
            className={`postSwapRow${hits && !hits[`swap:${entry.id}`] ? ' postRuleNoHits' : ''}`}
            ref={focusKey === `swap:${entry.id}` ? scrollNearest : undefined}
          >
            <input type="checkbox" checked={entry.enabled} onChange={(e) => patchEntry(entry.id, { enabled: e.target.checked })} />
            <input value={entry.phrase} placeholder="utilize" onChange={(e) => patchEntry(entry.id, { phrase: e.target.value })} />
            <input value={entry.replacement} placeholder="use" onChange={(e) => patchEntry(entry.id, { replacement: e.target.value })} />
            {hits && <span className="postHitCount">{hitsLabel(hits[`swap:${entry.id}`] ?? 0)}</span>}
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

/** A whole number from an input, held to 1..12. */
const smallCount = (value: string) => Math.min(12, Math.max(1, Math.round(Number(value)) || 1))

function AcrosticEditor({ acrostic, onChange }: { acrostic: AcrosticConfig; onChange: (acrostic: AcrosticConfig) => void }) {
  const patch = (over: Partial<AcrosticConfig>) => onChange({ ...acrostic, ...over })
  const range = (key: 'paragraphs' | 'sentencesPerParagraph', label: string) => {
    const [min, max] = acrostic[key]
    return (
      <label className="postGlobalField">
        {label}
        <input
          type="number"
          className="postAcrosticNumber"
          min={1}
          max={12}
          value={min}
          onChange={(e) => {
            const next = smallCount(e.target.value)
            patch({ [key]: [next, Math.max(next, max)] })
          }}
        />
        to
        <input
          type="number"
          className="postAcrosticNumber"
          min={1}
          max={12}
          value={max}
          onChange={(e) => {
            const next = smallCount(e.target.value)
            patch({ [key]: [Math.min(min, next), next] })
          }}
        />
      </label>
    )
  }
  return (
    <>
      <p className="hint">
        Each reply gets a paragraph and sentence shape, sentence types and starting letters drawn from the chat's recent
        replies, and the model fills them in. The reply shows when it is finished. Needs post-processing on in the chat.
      </p>
      {range('paragraphs', 'Paragraphs')}
      {range('sentencesPerParagraph', 'Sentences per paragraph')}
      <label className="postGlobalField">
        Beats
        <input
          type="number"
          className="postAcrosticNumber"
          min={0}
          max={4}
          value={acrostic.beatSlots}
          onChange={(e) => patch({ beatSlots: Math.min(4, Math.max(0, Math.round(Number(e.target.value)) || 0)) })}
        />
      </label>
      <p className="hint">A beat is a sentence that introduces a new event, choice or reveal.</p>
      <label className="checkboxRow">
        <input type="checkbox" checked={acrostic.jsonMode} onChange={(e) => patch({ jsonMode: e.target.checked })} />
        Ask for JSON
      </label>
      <p className="hint">Chat completion connections only. Text completion connections write tagged lines.</p>
    </>
  )
}

function LintEditor({
  lint,
  hits,
  focusKey,
  onChange,
}: {
  lint: LintConfig
  hits?: Record<string, number>
  focusKey: string | null
  onChange: (lint: LintConfig) => void
}) {
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
          <li
            key={rule.id}
            className={hits && !hits[`lint:${rule.id}`] ? 'postRuleNoHits' : undefined}
            ref={focusKey === `lint:${rule.id}` ? scrollNearest : undefined}
          >
            <label className="checkboxRow">
              <input
                type="checkbox"
                checked={!lint.off.includes(rule.id)}
                onChange={(e) => patch({ off: e.target.checked ? lint.off.filter((id) => id !== rule.id) : [...lint.off, rule.id] })}
              />
              {rule.label}
              {hits && <span className="postHitCount">{hitsLabel(hits[`lint:${rule.id}`] ?? 0)}</span>}
            </label>
            <p className="hint">{rule.description}</p>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * A chat's replies, run through the stack with no request. While a rule is open only its hits show.
 * Clicking a hit opens the item that found it.
 */
function Tester({
  replies,
  hits,
  only,
  onlyName,
  nameOf,
  onRun,
  onPick,
}: {
  replies: string[] | null
  hits: TesterHit[][] | null
  /** The open rule's key, or null for every hit. */
  only: string | null
  onlyName: string
  nameOf: (key: string) => string
  onRun: (chatId: number) => void
  onPick: (key: string) => void
}) {
  const [chats, setChats] = useState<Chat[]>([])
  const [chatId, setChatId] = useState<number | null>(null)
  useEffect(() => {
    useChats.getState().allChats().then(setChats)
  }, [])

  const shown = (replies ?? [])
    .map((text, i) => ({ text, i, hits: (hits?.[i] ?? []).filter((h) => !only || h.key === only) }))
    .filter((r) => r.hits.length)
  const total = shown.reduce((n, r) => n + r.hits.length, 0)

  return (
    <section className="postTester">
      <h3>Tester</h3>
      <div className="postTesterPick">
        <select
          className="postTesterChat"
          value={chatId ?? ''}
          onChange={(e) => setChatId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Pick a chat</option>
          {chats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <button type="button" disabled={chatId === null} onClick={() => chatId !== null && onRun(chatId)}>
          Run
        </button>
      </div>
      <p className="hint">Runs this stack over the chat's replies as the model wrote them. Switched-off items are counted too. Nothing is sent or saved.</p>

      {replies && hits && (
        <>
          <p className="hint">
            {only ? `${onlyName}: ` : ''}
            {hitsLabel(total)} in {shown.length} of {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </p>
          <ul className="postTesterResults">
            {shown.map((r) => (
              <li key={r.i} className="postTesterResult postTesterReply">
                <Highlighted text={r.text} hits={r.hits} nameOf={nameOf} onPick={onPick} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** A reply with its hits marked. Overlapping hits show the first; the counts still include the rest. */
function Highlighted({
  text,
  hits,
  nameOf,
  onPick,
}: {
  text: string
  hits: TesterHit[]
  nameOf: (key: string) => string
  onPick: (key: string) => void
}) {
  const out: React.ReactNode[] = []
  let at = 0
  hits.forEach((h, k) => {
    if (h.start < at) return
    out.push(text.slice(at, h.start))
    out.push(
      <button key={k} type="button" className="postTesterMark" title={nameOf(h.key)} onClick={() => onPick(h.key)}>
        {text.slice(h.start, h.end)}
      </button>,
    )
    at = h.end
  })
  out.push(text.slice(at))
  return <>{out}</>
}
