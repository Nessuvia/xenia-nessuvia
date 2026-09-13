import { useState } from 'react'

/** Edit one selected run of a reply without opening the whole message. */
export default function SelectionEditDialog({
  text,
  onClose,
  onSave,
}: {
  text: string
  onClose: () => void
  onSave: (text: string) => void
}) {
  const [draft, setDraft] = useState(text)

  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Edit selection</h3>
        <textarea
          autoFocus
          className="selectionEditText"
          rows={Math.min(draft.split('\n').length + 2, 12)}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSave(draft)
          }}
        />
        <div className="dialogActions">
          <button type="button" disabled={draft === text} onClick={() => onSave(draft)}>
            Save
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
