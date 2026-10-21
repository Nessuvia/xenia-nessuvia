// A note and its included descendants as one read-only document. Rendered as React elements from
// proseMarkup's parse: the text is the user's own, but it still never goes in as HTML.
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotes } from '../../core/stores/notesStore'
import { manuscript } from '../../core/notes/noteTree'
import { wordCount } from '../../core/quality/words'
import { isHeading, parseProse, type ProsePiece } from '../write/proseMarkup'

const classOf = { bold: 'proseBold', em: 'proseEm', boldEm: 'proseBold proseEm', quote: 'proseQuote', code: 'proseCode' }

function render(pieces: ProsePiece[]): ReactNode[] {
  return pieces.map((p, i) =>
    'text' in p ? p.text : <span key={i} className={classOf[p.kind]}>{render(p.children)}</span>,
  )
}

export default function Manuscript({ rootId }: { rootId: number }) {
  const notes = useNotes((s) => s.notes)
  const navigate = useNavigate()
  const sections = manuscript(notes, rootId)
  const words = sections.reduce((sum, s) => sum + wordCount(s.note.text), 0)

  return (
    <div className="notesManuscript proseDoc">
      <p className="hint">{words} words</p>
      {sections.map(({ note, depth }) => (
        <section key={note.id} className="notesManuscriptSection">
          <button
            type="button"
            className={`notesManuscriptTitle notesManuscriptDepth${Math.min(depth, 2)}`}
            title="Open this note"
            onClick={() => navigate(`/notes/${note.id}`)}
          >
            {note.title || 'Untitled'}
          </button>
          {note.text.split('\n').map((line, i) =>
            isHeading(line) ? (
              <p key={i} className="notesManuscriptLine proseDocHeading">{render(parseProse(line.slice(2)))}</p>
            ) : (
              <p key={i} className="notesManuscriptLine">{render(parseProse(line))}</p>
            ),
          )}
        </section>
      ))}
    </div>
  )
}
