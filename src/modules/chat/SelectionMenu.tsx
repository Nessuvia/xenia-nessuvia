import { RiDeleteBinLine, RiFilter2Line, RiPencilLine } from '@remixicon/react'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'

/** Right-click menu for a run of selected text inside a reply. */
export default function SelectionMenu({
  at,
  onDelete,
  onEdit,
  onMakeRule,
  onClose,
}: {
  at: { x: number; y: number }
  onDelete: () => void
  onEdit: () => void
  onMakeRule: () => void
  onClose: () => void
}) {
  const ref = useCloseOnOutside<HTMLDivElement>(true, onClose)

  return (
    <div
      ref={ref}
      className="panel selectionMenu"
      style={{
        left: Math.min(at.x, window.innerWidth - 160),
        top: Math.min(at.y, window.innerHeight - 140),
      }}
    >
      <button type="button" onClick={onDelete}>
        <RiDeleteBinLine size={14} />
        Delete
      </button>
      <button type="button" onClick={onEdit}>
        <RiPencilLine size={14} />
        Edit
      </button>
      <button type="button" onClick={onMakeRule}>
        <RiFilter2Line size={14} />
        Make rule
      </button>
    </div>
  )
}
