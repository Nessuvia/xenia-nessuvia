import { useEffect, useState } from 'react'
import { RiDeleteBinLine, RiFileCopyLine } from '@remixicon/react'
import { useSettings } from '../../core/stores/settingsStore'
import { usePipelines } from '../../core/stores/pipelineStore'
import {
  newPipeline,
  newStage,
  type CleanStage,
  type GateStage,
  type Pipeline,
  type RewriteStage,
  type ScoreStage,
  type Stage,
  type StageKind,
} from '../../core/secondSweep/pipeline'
import type { DetectSettings } from '../../core/secondSweep/detectSettings'
import { standingNotes } from '../../core/secondSweep/textRules'
import { downloadPipelines, parsePipelineFile } from '../../core/secondSweep/pipelineJson'
import ConnectionPicker from '../../app/ConnectionPicker'
import GrammarHammerPanel from './GrammarHammerPanel'
import PassPreview from './PassPreview'
import QualitySection from './QualitySection'
import TextRulesPanel from './TextRulesPanel'
import './settings.css'

type Tab = 'setup' | 'stages' | 'checks' | 'rules' | 'hammer'

const TABS: Array<[Tab, string]> = [
  ['setup', 'Setup'],
  ['stages', 'Stages'],
  ['checks', 'Checks'],
  ['rules', 'Rules'],
  ['hammer', 'Hammer'],
]

const STAGE_KINDS: Array<[StageKind, string]> = [
  ['gate', 'Gate'],
  ['clean', 'Clean'],
  ['rewrite', 'Rewrite'],
  ['score', 'Score'],
]

/**
 * Second Sweep: the pipeline library, and an editor for whichever pipeline is open.
 *
 * The tab state is a `useState` on purpose: the Settings sidebar keeps one flat entry for the
 * pass. There is nothing to link to and no hash to read.
 *
 * Two levels of writing happen here and they must not be confused. The Setup tab's enable toggle
 * and pipeline choice are the **global** default, which a chat can override in its own sidebar.
 * Everything else edits the **pipeline record**, which every chat using it sees.
 */
export default function SecondSweepPanel() {
  const settings = useSettings((s) => s.secondSweep)
  const setSettings = useSettings((s) => s.setSecondSweep)
  const { pipelines, loaded, load, create, update, remove } = usePipelines()
  const [tab, setTab] = useState<Tab>('setup')
  const [openId, setOpenId] = useState<number | null>(null)
  const [paste, setPaste] = useState('')
  const [importError, setImportError] = useState('')

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const open = pipelines.find((p) => p.id === openId) ?? pipelines.find((p) => p.id === settings.pipelineId)
  const patch = (over: Partial<Pipeline>) => open?.id !== undefined && void update(open.id, over)
  const patchDetect = (over: Partial<DetectSettings>) =>
    open && patch({ detect: { ...open.detect, ...over } })
  const patchStage = (id: string, over: Partial<Stage>) =>
    open &&
    patch({
      stages: open.stages.map((s) => (s.id === id ? ({ ...s, ...over } as Stage) : s)),
    })

  /** Add what the JSON holds. Import adds; it never replaces the library. A file with one
   *  pipeline in it cannot cost you the other five. */
  const addJson = async (text: string) => {
    try {
      for (const p of parsePipelineFile(text)) await create(p)
      setPaste('')
      setImportError('')
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that.')
    }
  }

  return (
    <div className="passPanel">
      <div className="passTabs">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={id === tab ? 'passTab passTabOn' : 'passTab'}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'setup' && (
        <section className="textRules screenFrame">
          <span className="titleContainer">
            <h3>Second Sweep</h3>
            <label className="checkboxRow">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings({ enabled: e.target.checked })}
              />
              Enable
            </label>
          </span>

          <div className="passBody">
            <p className="hint">
              Each reply is run through a pipeline before it is stored. A pipeline is a list of
              stages: check the reply, edit it, hand it to a second model, score what comes back.
            </p>

            <label className="passPrompt">
              Pipeline
              <select
                value={settings.pipelineId ?? ''}
                onChange={(e) =>
                  setSettings({ pipelineId: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">None</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">The global default. A chat can pick a different one in its sidebar.</p>

            <span className="passSectionTitle">Library</span>
            <ul className="ruleCards">
              {pipelines.map((p) => (
                <li className="card ruleCard" key={p.id}>
                  <div className="passRow">
                    <input
                      type="radio"
                      name="openPipeline"
                      checked={open?.id === p.id}
                      onChange={() => setOpenId(p.id ?? null)}
                    />
                    <input
                      className="passRowLabelInput"
                      value={p.label}
                      onChange={(e) => p.id !== undefined && void update(p.id, { label: e.target.value })}
                    />
                    <button
                      type="button"
                      title="Duplicate"
                      onClick={() => void create({ ...p, id: undefined, label: `${p.label} copy` })}
                    >
                      <RiFileCopyLine size={14} />
                    </button>
                    <button type="button" title="Export" onClick={() => downloadPipelines([p])}>
                      Export
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={() => p.id !== undefined && void remove(p.id)}
                    >
                      <RiDeleteBinLine size={14} />
                    </button>
                  </div>
                  {p.description && <p className="hint">{p.description}</p>}
                </li>
              ))}
            </ul>

            <div className="grammarActions">
              <button type="button" onClick={() => void create(newPipeline('New pipeline'))}>
                New pipeline
              </button>
              <button
                type="button"
                disabled={pipelines.length === 0}
                onClick={() => downloadPipelines(pipelines)}
              >
                Export all
              </button>
            </div>

            <label className="passPrompt">
              Paste a pipeline file
              <textarea
                className="passPromptInput"
                rows={3}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
            </label>
            <div className="grammarActions">
              <button type="button" disabled={!paste.trim()} onClick={() => void addJson(paste)}>
                Import
              </button>
            </div>
            {importError && <p className="hint">{importError}</p>}
          </div>
        </section>
      )}

      {tab !== 'setup' && !open && (
        <section className="textRules screenFrame">
          <p className="hint">No pipeline is open. Pick one in the library on the Setup tab.</p>
        </section>
      )}

      {tab === 'stages' && open && (
        <section className="textRules screenFrame">
          <span className="titleContainer">
            <h3>{open.label} stages</h3>
          </span>
          <div className="passBody">
            <p className="hint">
              Stages run top to bottom. Each one is handed what the stage before it produced.
            </p>
            <ul className="ruleCards">
              {open.stages.map((stage, i) => (
                <li className="card ruleCard" key={stage.id}>
                  <div className="passRow">
                    <label className="checkboxRow">
                      <input
                        type="checkbox"
                        checked={stage.enabled}
                        onChange={(e) => patchStage(stage.id, { enabled: e.target.checked })}
                      />
                      On
                    </label>
                    <input
                      className="passRowLabelInput"
                      value={stage.label}
                      onChange={(e) => patchStage(stage.id, { label: e.target.value })}
                    />
                    <button
                      type="button"
                      title="Move up"
                      disabled={i === 0}
                      onClick={() => patch({ stages: swap(open.stages, i, i - 1) })}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      title="Move down"
                      disabled={i === open.stages.length - 1}
                      onClick={() => patch({ stages: swap(open.stages, i, i + 1) })}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={() => patch({ stages: open.stages.filter((s) => s.id !== stage.id) })}
                    >
                      <RiDeleteBinLine size={14} />
                    </button>
                  </div>
                  <StageEditor
                    stage={stage}
                    pipeline={open}
                    patchStage={(over) => patchStage(stage.id, over)}
                    patchPipeline={patch}
                  />
                </li>
              ))}
            </ul>
            <div className="grammarActions">
              {STAGE_KINDS.map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => patch({ stages: [...open.stages, newStage(kind)] })}
                >
                  Add {label.toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {tab === 'checks' && open && (
        <ChecksTab pipeline={open} patchDetect={patchDetect} />
      )}
      {tab === 'rules' && open && <TextRulesPanel detect={open.detect} patch={patchDetect} />}
      {tab === 'hammer' && open && <GrammarHammerPanel detect={open.detect} patch={patchDetect} />}

      {open && <PassPreview detect={open.detect} />}
    </div>
  )
}

function swap(stages: Stage[], a: number, b: number): Stage[] {
  const next = [...stages]
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}

/** The detector settings, shared by the gate and the clean stage. */
function ChecksTab({
  pipeline,
  patchDetect,
}: {
  pipeline: Pipeline
  patchDetect: (over: Partial<DetectSettings>) => void
}) {
  const pun = pipeline.detect.punctuation

  return (
    <section className="textRules screenFrame">
      <span className="titleContainer">
        <h3>{pipeline.label} checks</h3>
      </span>
      <div className="passBody">
        <p className="hint">
          What counts as a problem. The gate counts these and the clean stage reports them. Rules
          and hammer patterns are on their own tabs.
        </p>

        <span className="passSectionTitle">Punctuation</span>
        <label className="checkboxRow">
          <input
            type="checkbox"
            checked={pun.dashes}
            onChange={(e) => patchDetect({ punctuation: { ...pun, dashes: e.target.checked } })}
          />
          Replace em dashes with commas
        </label>
        <label className="checkboxRow">
          <input
            type="checkbox"
            checked={pun.quotes}
            onChange={(e) => patchDetect({ punctuation: { ...pun, quotes: e.target.checked } })}
          />
          Straighten curly quotes and ellipses
        </label>

      </div>
    </section>
  )
}

/** The config rows for one stage, by kind. */
function StageEditor({
  stage,
  pipeline,
  patchStage,
  patchPipeline,
}: {
  stage: Stage
  pipeline: Pipeline
  patchStage: (over: Partial<Stage>) => void
  patchPipeline: (over: Partial<Pipeline>) => void
}) {
  if (stage.kind === 'gate') return <GateEditor stage={stage} patchStage={patchStage} />
  if (stage.kind === 'clean') return <CleanEditor stage={stage} patchStage={patchStage} />
  if (stage.kind === 'rewrite') {
    return <RewriteEditor stage={stage} pipeline={pipeline} patchStage={patchStage} patchPipeline={patchPipeline} />
  }
  return (
    <ScoreEditor
      stage={stage}
      pipeline={pipeline}
      patchStage={patchStage}
      patchPipeline={patchPipeline}
    />
  )
}

function GateEditor({
  stage,
  patchStage,
}: {
  stage: GateStage
  patchStage: (over: Partial<Stage>) => void
}) {
  const set = (over: Partial<GateStage['config']>) =>
    patchStage({ config: { ...stage.config, ...over } } as Partial<Stage>)
  return (
    <div className="passBody">
      <p className="hint">Stops the pipeline when the reply is clean enough to leave alone.</p>
      <div className="passNumbers">
        <label className="passNumber">
          Problems needed
          <input
            className="passNumberInput"
            type="number"
            min={0}
            max={20}
            value={stage.config.minNotes}
            onChange={(e) => set({ minNotes: Number(e.target.value) })}
          />
        </label>
      </div>
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={stage.config.standingCounts}
          onChange={(e) => set({ standingCounts: e.target.checked })}
        />
        A rule that applies to every reply counts as a problem
      </label>
      <p className="hint">0 problems needed means the gate never stops anything.</p>
    </div>
  )
}

function CleanEditor({
  stage,
  patchStage,
}: {
  stage: CleanStage
  patchStage: (over: Partial<Stage>) => void
}) {
  const set = (over: Partial<CleanStage['config']>) =>
    patchStage({ config: { ...stage.config, ...over } } as Partial<Stage>)
  return (
    <div className="passBody">
      <p className="hint">
        Strip and replace rules run with no request. What is left is sent to a model as a list of
        problems to fix.
      </p>
      <ConnectionPicker
        value={stage.config.connectionId}
        onChange={(connectionId) => set({ connectionId })}
        allowActive
        label="Editing connection"
      />
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={stage.config.skipWhenClean}
          onChange={(e) => set({ skipWhenClean: e.target.checked })}
        />
        Skip the request when nothing is found
      </label>
      <label className="passPrompt">
        Standing instruction
        <textarea
          className="passPromptInput"
          rows={3}
          value={stage.config.userPrompt}
          onChange={(e) => set({ userPrompt: e.target.value })}
        />
      </label>
    </div>
  )
}

function RewriteEditor({
  stage,
  pipeline,
  patchStage,
  patchPipeline,
}: {
  stage: RewriteStage
  pipeline: Pipeline
  patchStage: (over: Partial<Stage>) => void
  patchPipeline: (over: Partial<Pipeline>) => void
}) {
  const set = (over: Partial<RewriteStage['config']>) =>
    patchStage({ config: { ...stage.config, ...over } } as Partial<Stage>)
  const census = pipeline.census
  const standing = standingNotes(pipeline.detect.textRules, 'assistant').length

  return (
    <div className="passBody">
      <p className="hint">
        A second model rewrites the whole passage. Its window is the preset, the card and a few
        recent turns, not the chat's prompt stack.
        {standing > 0 && ' Standing rules are not sent here; they belong to the clean stage.'}
      </p>
      <ConnectionPicker
        value={stage.config.connectionId || null}
        onChange={(connectionId) => set({ connectionId: connectionId ?? '' })}
        label="Rewriting connection"
      />
      <label className="passPrompt">
        Preset
        <textarea
          className="passPromptInput"
          rows={6}
          value={stage.config.preset}
          onChange={(e) => set({ preset: e.target.value })}
        />
      </label>
      <div className="passNumbers">
        <label className="passNumber">
          Messages of history
          <input
            className="passNumberInput"
            type="number"
            min={0}
            max={40}
            value={stage.config.historyCount}
            onChange={(e) => set({ historyCount: Number(e.target.value) })}
          />
        </label>
      </div>
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={stage.config.includeCharacter}
          onChange={(e) => set({ includeCharacter: e.target.checked })}
        />
        Include the character's description
      </label>

      <span className="passSectionTitle">Overused phrases</span>
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={census.enabled}
          onChange={(e) => patchPipeline({ census: { ...census, enabled: e.target.checked } })}
        />
        Count what this chat has already used
      </label>
      <div className="passNumbers">
        <label className="passNumber">
          Replies counted
          <input
            className="passNumberInput"
            type="number"
            min={1}
            max={100}
            value={census.windowSize}
            onChange={(e) => patchPipeline({ census: { ...census, windowSize: Number(e.target.value) } })}
          />
        </label>
        <label className="passNumber">
          Uses before banned
          <input
            className="passNumberInput"
            type="number"
            min={2}
            max={20}
            value={census.minCount}
            onChange={(e) => patchPipeline({ census: { ...census, minCount: Number(e.target.value) } })}
          />
        </label>
        <label className="passNumber">
          Phrases kept
          <input
            className="passNumberInput"
            type="number"
            min={0}
            max={200}
            value={census.maxEntries}
            onChange={(e) => patchPipeline({ census: { ...census, maxEntries: Number(e.target.value) } })}
          />
        </label>
      </div>
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={stage.config.promptBannedList}
          onChange={(e) => set({ promptBannedList: e.target.checked })}
        />
        List the phrases in the rewrite prompt
      </label>
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={stage.config.samplerBannedList}
          onChange={(e) => set({ samplerBannedList: e.target.checked })}
        />
        Send them as banned_strings
      </label>
      <p className="hint">
        Sent only when the rewriting connection carries a banned_strings param. Add it in the
        connection's sampler list.
      </p>
    </div>
  )
}

function ScoreEditor({
  stage,
  pipeline,
  patchStage,
  patchPipeline,
}: {
  stage: ScoreStage
  pipeline: Pipeline
  patchStage: (over: Partial<Stage>) => void
  patchPipeline: (over: Partial<Pipeline>) => void
}) {
  const set = (over: Partial<ScoreStage['config']>) =>
    patchStage({ config: { ...stage.config, ...over } } as Partial<Stage>)
  return (
    <div className="passBody">
      <p className="hint">
        Judges what the stage before it produced against what went into that stage, paragraph by
        paragraph.
      </p>
      <div className="passNumbers">
        <label className="passNumber">
          Shortest allowed
          <input
            className="passNumberInput"
            type="number"
            min={0.1}
            max={1}
            step={0.05}
            value={stage.config.minRatio}
            onChange={(e) => set({ minRatio: Number(e.target.value) })}
          />
        </label>
        <label className="passNumber">
          Longest allowed
          <input
            className="passNumberInput"
            type="number"
            min={1}
            max={5}
            step={0.1}
            value={stage.config.maxRatio}
            onChange={(e) => set({ maxRatio: Number(e.target.value) })}
          />
        </label>
      </div>
      <p className="hint">A fraction of the original length. Outside the band, nothing is kept.</p>
      <QualitySection
        config={stage.config}
        patchConfig={set}
        lexicon={pipeline.lexicon}
        patchLexicon={(lexicon) => patchPipeline({ lexicon })}
      />
    </div>
  )
}
