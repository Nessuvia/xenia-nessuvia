import type { DetectSettings } from '../../../core/secondSweep/detectSettings'
import type { Pipeline } from '../../../core/secondSweep/pipeline'
import RulesPanel from '../RulesPanel'
import PassPreview from '../PassPreview'
import './pipeline.css'

/**
 * The three inputs every stage below reads: the rules, the punctuation sweep, and the sample
 * preview that shows what they would do.
 *
 * The lexicon is not here. It belongs to the score stage, which is the only thing that reads it,
 * and `QualitySection` already edits it there.
 */
export default function DetectorsInspector({
  pipeline,
  patchDetect,
}: {
  pipeline: Pipeline
  patchDetect: (over: Partial<DetectSettings>) => void
}) {
  const pun = pipeline.detect.punctuation

  return (
    <div className="pipelineInspector">
      <div className="pipelineInspectorHead">
        <h3 className="pipelineInspectorTitle">Detectors</h3>
      </div>

      <div className="passBody">
        <p className="hint">
          What counts as a problem. The gate counts these, the clean stage reports them, and the
          score stage measures against them.
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

      <RulesPanel detect={pipeline.detect} patch={patchDetect} />
      <PassPreview detect={pipeline.detect} />
    </div>
  )
}
