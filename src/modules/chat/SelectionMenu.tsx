import { RiAsterisk, RiDeleteBinLine, RiDoubleQuotesL, RiFilter2Line, RiPencilLine } from '@remixicon/react'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'

/** Right-click menu for a run of selected text inside a reply. */
export default function SelectionMenu({
  at,
  onDelete,
  onEdit,
  onWrap,
  onMakeRule,
  onClose,
}: {
  at: { x: number; y: number }
  onDelete: () => void
  onEdit: () => void
  onWrap: (mark: string) => void
  onMakeRule: () => void
  onClose: () => void
}) {
  const ref = useCloseOnOutside<HTMLDivElement>(true, onClose)

  return (
    <div
      ref={ref}
      className="panel selectionMenu"
      style={{
        left: Math.min(at.x, window.innerWidth - 200),
        top: Math.min(at.y, window.innerHeight - 220),
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
      <button type="button" onClick={() => onWrap('*')}>
        <RiAsterisk size={14} />
        Wrap in asterisks
      </button>
      <button type="button" onClick={() => onWrap('"')}>
        <RiDoubleQuotesL size={14} />
        Wrap in double quotes
      </button>
      <button type="button" onClick={onMakeRule}>
        <RiFilter2Line size={14} />
        Make rule
      </button>
    </div>
  )
}
