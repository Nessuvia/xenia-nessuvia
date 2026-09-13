import { useState } from 'react'
import {
  RiAddLine,
  RiEraserLine,
  RiFilterLine,
  RiQuillPenLine,
  RiRadarLine,
  RiScales3Line,
} from '@remixicon/react'
import { useSettings } from '../../../core/stores/settingsStore'
import { useCloseOnOutside } from '../../../app/useCloseOnOutside'
import { useDragReorder } from '../../../app/useDragReorder'
import { newStage, type Pipeline, type Stage, type StageKind } from '../../../core/secondSweep/pipeline'
import { stageSummary, detectorsSummary } from './stageSummary'
import StageNode from './StageNode'
import './pipeline.css'

const kindIcons: Record<StageKind, typeof RiFilterLine> = {
  gate: RiFilterLine,
  clean: RiEraserLine,
  rewrite: RiQuillPenLine,
  score: RiScales3Line,
}

const KINDS: Array<[StageKind, string]> = [
  ['gate', 'Gate'],
  ['clean', 'Clean'],
  ['rewrite', 'Rewrite'],
  ['score', 'Score'],
]

/** What the editor has selected: the shared inputs, or one stage by id. */
export type Selection = { kind: 'detectors' } | { kind: 'stage'; id: string }

/**
 * The pipeline as a chain, read top to bottom.
 *
 * The Detectors node is pinned at the top and is not a stage. `detect`, `lexicon` and `census` are
 * inputs the gate, clean and score stages all read, so drawing them as the source of the chain is
 * honest about how a run actually works. They used to own three tabs, which said nothing about
 * when they applied.
 */
export default function PipelineDiagram({
  pipeline,
  selected,
  onSelect,
  patch,
}: {
  pipeline: Pipeline
  selected: Selection
  onSelect: (selection: Selection) => void
  patch: (over: Partial<Pipeline>) => void
}) {
  const connections = useSettings((s) => s.connections)
  const connectionName = (id: string | null) =>
    id ? connections.find((c) => c.id === id)?.name ?? 'Missing connection' : 'Active connection'

  const reorder = useDragReorder((from, to) => {
    const next = [...pipeline.stages]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    patch({ stages: next })
  })

  const insert = (kind: StageKind, at: number) => {
    const stage = newStage(kind)
    patch({ stages: pipeline.stages.toSpliced(at, 0, stage) })
    onSelect({ kind: 'stage', id: stage.id })
  }

  return (
    <div className="pipelineDiagram">
      <StageNode
        title="Detectors"
        summary={detectorsSummary(pipeline)}
        icon={<RiRadarLine size={16} />}
        enabled
        selected={selected.kind === 'detectors'}
        onSelect={() => onSelect({ kind: 'detectors' })}
      />

      <Connector onAdd={(kind) => insert(kind, 0)} />

      {pipeline.stages.map((stage, i) => {
        const Icon = kindIcons[stage.kind]
        return (
          <div key={stage.id} className="pipelineStep">
            <StageNode
              title={stage.label}
              summary={stageSummary(stage, connectionName)}
              icon={<Icon size={16} />}
              enabled={stage.enabled}
              selected={selected.kind === 'stage' && selected.id === stage.id}
              over={reorder.over === i}
              onSelect={() => onSelect({ kind: 'stage', id: stage.id })}
              onToggle={(enabled) => patchStage(pipeline, patch, stage.id, { enabled })}
              drag={reorder.itemProps(i)}
            />
            <Connector onAdd={(kind) => insert(kind, i + 1)} />
          </div>
        )
      })}

      {pipeline.stages.length === 0 && (
        <p className="pipelineEmpty">No stages. A pipeline with none does nothing to a reply.</p>
      )}
    </div>
  )
}

function patchStage(
  pipeline: Pipeline,
  patch: (over: Partial<Pipeline>) => void,
  id: string,
  over: Partial<Stage>,
) {
  patch({ stages: pipeline.stages.map((s) => (s.id === id ? ({ ...s, ...over } as Stage) : s)) })
}

/** The line between two nodes, and the button that puts a stage there. Inserting at a position
 *  rather than appending is the point: order is what a pipeline is. */
function Connector({ onAdd }: { onAdd: (kind: StageKind) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useCloseOnOutside<HTMLDivElement>(open, () => setOpen(false))

  return (
    <div className="pipelineConnector" ref={ref}>
      <button
        type="button"
        className="pipelineInsert"
        title="Add a stage here"
        onClick={() => setOpen(!open)}
      >
        <RiAddLine size={14} />
      </button>
      {open && (
        <div className="pipelineInsertMenu">
          {KINDS.map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className="pipelineInsertMenuItem"
              onClick={() => {
                onAdd(kind)
                setOpen(false)
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
