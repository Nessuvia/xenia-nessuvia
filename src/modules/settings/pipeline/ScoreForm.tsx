import QualitySection from './QualitySection'
import type { Pipeline, ScoreStage, Stage } from '../../../core/secondSweep/pipeline'
import './pipeline.css'

/** The score stage: judges what the stage before it produced against what went into that stage. */
export default function ScoreForm({
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
