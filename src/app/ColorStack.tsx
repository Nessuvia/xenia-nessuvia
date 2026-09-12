import { useState } from 'react'
import { RiDraggable } from '@remixicon/react'
import type { MarkerKind } from '../core/stores/settingsStore'
import { ColorInput } from './ColorInput'
import './ColorStack.css'

// The draggable marker-color list: one row per marker kind, top-first precedence, with the Text
// baseline pinned at the bottom. Chat and Write each keep their own colors and their own order.
// This holds no settings of its own. The panel that renders it says which fields it writes.

const kindLabel: Record<MarkerKind, string> = {
  emphasis: 'Emphasis',
  bold: 'Bold',
  quotes: 'Quotes',
}

export default function ColorStack({
  order,
  colorOf,
  textColor,
  onOrder,
  onColor,
  onTextColor,
  disabled,
}: {
  order: MarkerKind[]
  colorOf: (kind: MarkerKind) => string
  textColor: string
  /** Leave it out where precedence isn't editable: the rows stop being draggable and lose their
   *  grab handles, the same way the fixed Text row already reads. */
  onOrder?: (order: MarkerKind[]) => void
  onColor: (kind: MarkerKind, color: string) => void
  onTextColor: (color: string) => void
  /** Shown but not editable, the swatches still say what the colors are. The fieldset takes care
   *  of the inputs; dragging has to be turned off by hand. */
  disabled?: boolean
}) {
  const [dragging, setDragging] = useState<MarkerKind | null>(null)

  const reorder = !disabled && onOrder !== undefined

  // Drop `dragging` in front of `target`, rebuilding the top-first order.
  const drop = (target: MarkerKind) => {
    if (!onOrder || !dragging || dragging === target) return
    const rest = order.filter((k) => k !== dragging)
    const at = rest.indexOf(target)
    onOrder([...rest.slice(0, at), dragging, ...rest.slice(at)])
    setDragging(null)
  }

  return (
    <fieldset className="colorStack" disabled={disabled}>
      {order.map((kind) => (
        <div
          key={kind}
          className={`colorStackRow${dragging === kind ? ' dragging' : ''}${reorder ? '' : ' fixed'}`}
          draggable={reorder}
          onDragStart={() => setDragging(kind)}
          onDragEnd={() => setDragging(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => drop(kind)}
        >
          <RiDraggable className="dragHandle" size={18} />
          <span>{kindLabel[kind]}</span>
          <ColorInput value={colorOf(kind)} onChange={(v) => onColor(kind, v)} />
        </div>
      ))}
      <div className="colorStackRow fixed">
        <RiDraggable className="dragHandle" size={18} />
        <span>Text</span>
        <ColorInput value={textColor} onChange={onTextColor} />
      </div>
    </fieldset>
  )
}
