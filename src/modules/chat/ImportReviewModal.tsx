import { useState } from 'react'
import { RiCloseLine } from '@remixicon/react'
import type { ImportedBook } from '../lorebooks/importLorebook'

/**
 * Shown between parsing a card and saving it, when the card carries tags or an embedded lorebook.
 * Card sites hand out whatever the uploader typed. This is the gate that keeps both lists yours.
 * Every tag starts included and clicking one drops it; the book starts checked.
 */
export default function ImportReviewModal({
  tags,
  book,
  onConfirm,
  onClose,
}: {
  tags: string[]
  /** The card's `character_book`, already mapped. Undefined when it carried no entries. */
  book?: ImportedBook
  onConfirm: (kept: string[], includeBook: boolean) => void
  onClose: () => void
}) {
  const [dropped, setDropped] = useState<string[]>([])
  const [includeBook, setIncludeBook] = useState(true)
  const kept = tags.filter((t) => !dropped.includes(t))
  const example = book?.entries[0]

  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="panel dialog importReviewDialog" onClick={(e) => e.stopPropagation()}>
        <div className="palettePromptHead">
          <h3>Import card</h3>
          <button type="button" title="Close" onClick={onClose}>
            <RiCloseLine size={16} />
          </button>
        </div>

        {tags.length > 0 && (
          <div className="importReviewSection">
            <h4 className="importReviewTitle">Tags</h4>
            <p className="hint">This card carries tags. Click one to leave it out.</p>
            <div className="importTagBadges">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`importTagBadge${dropped.includes(tag) ? ' dropped' : ''}`}
                  aria-pressed={!dropped.includes(tag)}
                  onClick={() =>
                    setDropped((d) => (d.includes(tag) ? d.filter((t) => t !== tag) : [...d, tag]))
                  }
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {book && example && (
          <div className="importReviewSection">
            <h4 className="importReviewTitle">Lorebook</h4>
            <label className="importReviewCheck">
              <input
                type="checkbox"
                checked={includeBook}
                onChange={(e) => setIncludeBook(e.target.checked)}
              />
              Import the lorebook embedded in this card
            </label>
            <p className="hint">
              {book.book.name} · {book.entries.length} entr{book.entries.length === 1 ? 'y' : 'ies'},
              attached to the character.
            </p>

            <div className="card importReviewEntry">
              <p className="importReviewEntryName">{example.name}</p>
              <p className="hint importReviewEntryKeys">
                {example.always ? 'Always sent' : `Keys: ${example.keys.join(', ') || 'none'}`}
              </p>
              <p className="importReviewEntryText">
                {example.content.slice(0, 300)}
                {example.content.length > 300 ? '…' : ''}
              </p>
            </div>
          </div>
        )}

        <div className="dialogActions">
          <button type="button" onClick={() => onConfirm([], false)}>
            {tags.length > 0 && book ? 'Skip both' : 'Skip'}
          </button>
          <button type="button" onClick={() => onConfirm(kept, includeBook)}>
            Import
          </button>
        </div>
      </div>
    </div>
  )
}
