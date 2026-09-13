import { useState } from 'react'
import { RiArrowLeftLine } from '@remixicon/react'
import TwoColumn from '../../../app/TwoColumn'
import { usePipelines } from '../../../core/stores/pipelineStore'
import { pipelineProblem, type Pipeline, type Stage } from '../../../core/secondSweep/pipeline'
import type { DetectSettings } from '../../../core/secondSweep/detectSettings'
import PipelineDiagram, { type Selection } from './PipelineDiagram'
import StageInspector from './StageInspector'
import DetectorsInspector from './DetectorsInspector'
import './pipeline.css'

/**
 * One pipeline, drawn as the chain it is.
 *
 * Selection is local state rather than the URL. A pipeline's id is a Dexie row number that differs
 * between installs, so a link naming one would break the moment a backup was restored somewhere
 * else.
 */
export default function PipelineEditor({
  pipeline,
  onClose,
}: {
  pipeline: Pipeline
  onClose: () => void
}) {
  const update = usePipelines((s) => s.update)
  const [selected, setSelected] = useState<Selection>({ kind: 'detectors' })

  const patch = (over: Partial<Pipeline>) =>
    pipeline.id !== undefined && void update(pipeline.id, over)
  const patchDetect = (over: Partial<DetectSettings>) =>
    patch({ detect: { ...pipeline.detect, ...over } })

  const stage = selected.kind === 'stage'
    ? pipeline.stages.find((s) => s.id === selected.id)
    : undefined
  // A deleted stage leaves the selection pointing at nothing. Fall back rather than render blank.
  const showing: Selection = selected.kind === 'stage' && !stage ? { kind: 'detectors' } : selected

  const problem = pipelineProblem(pipeline)

  return (
    <div className="pipelineEditor">
      <div className="pipelineEditorHead">
        <button type="button" className="pipelineBack" onClick={onClose}>
          <RiArrowLeftLine size={14} />
          Library
        </button>
        <input
          className="pipelineEditorLabel"
          value={pipeline.label}
          placeholder="Pipeline name"
          onChange={(e) => patch({ label: e.target.value })}
        />
      </div>
      <input
        className="pipelineEditorDescription"
        value={pipeline.description}
        placeholder="What this pipeline is for. Only read by whoever opens the file."
        onChange={(e) => patch({ description: e.target.value })}
      />
      {problem && <p className="hint">{problem}</p>}

      <TwoColumn
        list={
          <PipelineDiagram
            pipeline={pipeline}
            selected={showing}
            onSelect={setSelected}
            patch={patch}
          />
        }
        detail={
          showing.kind === 'detectors' ? (
            <DetectorsInspector pipeline={pipeline} patchDetect={patchDetect} />
          ) : (
            <StageInspector
              stage={stage as Stage}
              pipeline={pipeline}
              patchStage={(over) =>
                patch({
                  stages: pipeline.stages.map((s) =>
                    s.id === stage?.id ? ({ ...s, ...over } as Stage) : s,
                  ),
                })
              }
              patchPipeline={patch}
              onDelete={() => {
                patch({ stages: pipeline.stages.filter((s) => s.id !== stage?.id) })
                setSelected({ kind: 'detectors' })
              }}
            />
          )
        }
      />
    </div>
  )
}
