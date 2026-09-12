import { useRef, useState } from 'react'
import type { DragEvent } from 'react'

/** What starts a drag. On the row for a plain list, on a handle for a row holding text fields. */
export interface DragHandleProps {
  draggable: boolean
  onDragStart: () => void
  onDragEnd: () => void
}

/** What accepts one. Always on the row: the whole row is the target whatever started the drag. */
export interface DragDropProps {
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

export interface DragReorder {
  /** Spread onto each draggable row. Handle and target in one, for a row with nothing selectable
   *  in it. A row containing an input or a textarea must use `handleProps`/`dropProps` instead. */
  itemProps(index: number): DragHandleProps & DragDropProps
  /**
   * The drag half, for a dedicated handle inside the row.
   *
   * `draggable` on an ancestor stops Chrome placing the caret in a text field below it: a press
   * and drag inside the field starts a row drag instead of selecting. The caret sticks at the
   * start and clicking between words does nothing. Any row holding an `input` or `textarea` puts
   * this on a handle element and `dropProps` on the row.
   */
  handleProps(index: number): DragHandleProps
  /** The drop half, for the row itself. Pairs with `handleProps`. */
  dropProps(index: number): DragDropProps
  /** The index currently hovered as a drop target, for the highlight class. */
  over: number | null
}

/**
 * Drag-to-reorder over a list, using native HTML5 drag events.
 * `onReorder` receives the moved item's original and new index and is not called for a no-op drop.
 * `pinnedFirst` blocks moving index 0 and blocks dropping anything ahead of it.
 */
export function useDragReorder(
  onReorder: (from: number, to: number) => void,
  pinnedFirst?: boolean,
): DragReorder {
  const drag = useRef<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  function drop(to: number) {
    const from = drag.current
    drag.current = null
    setOver(null)
    if (from === null || from === to) return
    if (pinnedFirst && (from === 0 || to === 0)) return
    onReorder(from, to)
  }

  const handleProps = (index: number): DragHandleProps => ({
    draggable: true,
    onDragStart: () => (drag.current = index),
    onDragEnd: () => {
      drag.current = null
      setOver(null)
    },
  })

  const dropProps = (index: number): DragDropProps => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      setOver(index)
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      drop(index)
    },
  })

  return {
    over,
    handleProps,
    dropProps,
    itemProps: (index: number) => ({ ...handleProps(index), ...dropProps(index) }),
  }
}
