import type { ReactNode } from 'react'
import type { DragHandleProps, DragDropProps } from '../../../app/useDragReorder'

/**
 * One node in the diagram: what the stage is, whether it runs, and one line of what it would do.
 *
 * The card is the whole drag handle. It holds a checkbox and no text field, so `itemProps` is safe
 * here: `draggable` on an ancestor only breaks caret placement in an `input` or `textarea`, and
 * every field belonging to this stage lives in the inspector instead.
 *
 * `badge` renders nothing today. It is the slot a last-run status would go in, and it exists so
 * that wiring one up later is a change to one component rather than to the diagram's layout.
 * `runPipeline` returns a rolled-up result with no per-stage detail, so there is nothing to put in
 * it yet.
 */
export default function StageNode({
  title,
  summary,
  icon,
  enabled,
  selected,
  over,
  badge,
  onSelect,
  onToggle,
  drag,
}: {
  title: string
  summary: string
  icon: ReactNode
  enabled: boolean
  selected: boolean
  over?: boolean
  badge?: ReactNode
  onSelect: () => void
  onToggle?: (enabled: boolean) => void
  drag?: DragHandleProps & DragDropProps
}) {
  const classes = ['pipelineNode']
  if (selected) classes.push('pipelineNodeOn')
  if (!enabled) classes.push('pipelineNodeOff')
  if (over) classes.push('pipelineNodeOver')

  return (
    <div className={classes.join(' ')} {...drag}>
      <button type="button" className="pipelineNodeBody" onClick={onSelect}>
        <span className="pipelineNodeIcon">{icon}</span>
        <span className="pipelineNodeText">
          <span className="pipelineNodeTitle">{title}</span>
          <span className="pipelineNodeSummary">{summary}</span>
        </span>
        {badge}
      </button>
      {onToggle && (
        <label className="pipelineNodeToggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          On
        </label>
      )}
    </div>
  )
}
