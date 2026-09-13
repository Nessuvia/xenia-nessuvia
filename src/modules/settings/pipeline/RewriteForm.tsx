import ConnectionPicker from '../../../app/ConnectionPicker'
import { stageArmed, type Pipeline, type RewriteStage, type Stage } from '../../../core/secondSweep/pipeline'
import { standingRules } from '../../../core/secondSweep/rules'
import './pipeline.css'

/**
 * The rewrite stage: a second model rewrites the passage whole.
 *
 * The census numbers are the pipeline's rather than the stage's, and they are edited here because
 * this is the only stage that uses them. Named in the section title so the wider scope is visible:
 * two rewrite stages in one pipeline share these.
 */
export default function RewriteForm({
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
  const standing = standingRules(pipeline.detect.rules, 'assistant').length

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
      {!stageArmed(stage) && (
        <p className="hint">This stage does not run until it has both a connection and a preset.</p>
      )}
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

      <span className="passSectionTitle">Overused phrases (whole pipeline)</span>
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
