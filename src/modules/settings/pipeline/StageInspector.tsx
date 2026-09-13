import { RiDeleteBinLine } from '@remixicon/react'
import ConnectionPicker from '../../../app/ConnectionPicker'
import type {
  CleanStage,
  GateStage,
  Pipeline,
  Stage,
} from '../../../core/secondSweep/pipeline'
import RewriteForm from './RewriteForm'
import ScoreForm from './ScoreForm'
import './pipeline.css'

/**
 * The fields for the selected stage, beside the diagram.
 *
 * A node shows one line and this shows everything else. The split is the whole point of the
 * redesign: a rewrite stage carries a preset, a connection and six toggles, and none of that
 * belongs on a card in a chain.
 *
 * Delete lives here rather than on the node. A misclick in a diagram should never destroy a stage.
 */
export default function StageInspector({
  stage,
  pipeline,
  patchStage,
  patchPipeline,
  onDelete,
}: {
  stage: Stage
  pipeline: Pipeline
  patchStage: (over: Partial<Stage>) => void
  patchPipeline: (over: Partial<Pipeline>) => void
  onDelete: () => void
}) {
  return (
    <div className="pipelineInspector">
      <div className="pipelineInspectorHead">
        <input
          className="pipelineInspectorLabel"
          value={stage.label}
          onChange={(e) => patchStage({ label: e.target.value })}
        />
        <button type="button" className="pipelineInspectorDelete" title="Delete stage" onClick={onDelete}>
          <RiDeleteBinLine size={14} />
        </button>
      </div>

      {stage.kind === 'gate' && <GateForm stage={stage} patchStage={patchStage} />}
      {stage.kind === 'clean' && <CleanForm stage={stage} patchStage={patchStage} />}
      {stage.kind === 'rewrite' && (
        <RewriteForm
          stage={stage}
          pipeline={pipeline}
          patchStage={patchStage}
          patchPipeline={patchPipeline}
        />
      )}
      {stage.kind === 'score' && (
        <ScoreForm
          stage={stage}
          pipeline={pipeline}
          patchStage={patchStage}
          patchPipeline={patchPipeline}
        />
      )}
    </div>
  )
}

function GateForm({
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

function CleanForm({
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
