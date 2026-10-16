// The Notes tree. Takes the sidebar over on /notes, the way an open Story or chat does.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, DragEvent } from 'react'
import { Link, useMatch, useNavigate } from 'react-router-dom'
import { RiAddLine, RiMore2Line } from '@remixicon/react'
import { useNotes } from '../../core/stores/notesStore'
import { ancestorIds, moveNote, stepMove, treeOrder, visibleRows, type DropWhere, type Step } from '../../core/notes/noteTree'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import type { Note } from '../../core/storage/types'

// This browser's view state, not the user's data.
export const lastOpenKey = 'nessuTavern.notesLastOpen'
const expandedKey = 'nessuTavern.notesExpanded'

const steps: [Step, string][] = [
  ['up', 'Move up'],
  ['down', 'Move down'],
  ['indent', 'Indent'],
  ['outdent', 'Outdent'],
]

function RowMenu({ note, onAddChild }: { note: Note; onAddChild: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useCloseOnOutside<HTMLDivElement>(open, () => setOpen(false))
  const { notes, move } = useNotes()
  return (
    <div className="notesRowMenuWrap" ref={ref}>
      <button type="button" className="notesRowButton" title="More" aria-label="More" onClick={() => setOpen(!open)}>
        <RiMore2Line size={16} />
      </button>
      {open && (
        <div className="notesRowMenu">
          <button type="button" className="notesRowMenuItem" onClick={() => (setOpen(false), onAddChild())}>
            Add child note
          </button>
          {steps.map(([step, label]) => {
            const rows = stepMove(notes, note.id!, step)
            return (
              <button
                key={step}
                type="button"
                className="notesRowMenuItem"
                disabled={!rows}
                onClick={() => {
                  setOpen(false)
                  if (rows) move(rows)
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function NotesTree() {
  const { notes, loaded, load, create, move } = useNotes()
  const navigate = useNavigate()
  const currentId = Number(useMatch('/notes/:noteId')?.params.noteId) || null
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(
    () => new Set<number>(JSON.parse(localStorage.getItem(expandedKey) ?? '[]') as number[]),
  )
  const dragId = useRef<number | null>(null)
  const [over, setOver] = useState<{ id: number; where: DropWhere } | null>(null)

  const saveExpanded = (change: (prev: Set<number>) => Set<number>) =>
    setExpanded((prev) => {
      const next = change(prev)
      localStorage.setItem(expandedKey, JSON.stringify([...next]))
      return next
    })

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  // Opening a note shows it in the tree with its children, and is where Notes reopens next time.
  // Keyed on the open note, not the list: every save changes the list, and would undo a collapse.
  useEffect(() => {
    const notes = useNotes.getState().notes
    if (!currentId || !notes.some((n) => n.id === currentId)) return
    localStorage.setItem(lastOpenKey, String(currentId))
    const shown = [currentId, ...ancestorIds(notes, currentId)]
    saveExpanded((prev) => (shown.every((id) => prev.has(id)) ? prev : new Set([...prev, ...shown])))
  }, [currentId, loaded])

  async function addChild(parentId: number | null) {
    const id = await create(parentId)
    navigate(`/notes/${id}`)
  }

  // Top quarter drops before, bottom quarter after, the middle drops into.
  function onDragOver(e: DragEvent, id: number) {
    if (dragId.current === null) return
    e.preventDefault()
    const box = e.currentTarget.getBoundingClientRect()
    const y = (e.clientY - box.top) / box.height
    const where: DropWhere = y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into'
    if (over?.id !== id || over.where !== where) setOver({ id, where })
  }

  function onDrop(e: DragEvent, id: number) {
    e.preventDefault()
    const from = dragId.current
    dragId.current = null
    setOver(null)
    if (from === null || !over) return
    const rows = moveNote(notes, from, id, over.where)
    if (!rows) return
    move(rows)
    if (over.where === 'into') saveExpanded((prev) => new Set([...prev, id]))
  }

  const query = search.trim().toLowerCase()

  return (
    <section className="panel notesTree screenBody">
      <div className="notesTreeTop">
        <input
          type="search"
          className="notesTreeSearch"
          placeholder="Search notes"
          aria-label="Search notes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="notesRowButton" title="New note" aria-label="New note" onClick={() => addChild(null)}>
          <RiAddLine size={18} />
        </button>
      </div>

      {query ? (
        <div className="notesTreeList">
          {treeOrder(notes)
            .filter((n) => n.title.toLowerCase().includes(query) || n.text.toLowerCase().includes(query))
            .map((n) => (
              <div key={n.id} className={`notesRow${n.id === currentId ? ' active' : ''}`}>
                <Link to={`/notes/${n.id}`} className="notesRowLink">
                  {n.title || 'Untitled'}
                </Link>
              </div>
            ))}
        </div>
      ) : (
        <div className="notesTreeList">
          {notes.length === 0 && <p className="hint">No notes yet.</p>}
          {visibleRows(notes, expanded).map(({ note, depth, hasChildren }) => {
            const id = note.id!
            const isOpen = expanded.has(id)
            const drop = over?.id === id ? ` notesRowDrop${over.where[0].toUpperCase()}${over.where.slice(1)}` : ''
            return (
              <div
                key={id}
                className={`notesRow${id === currentId ? ' active' : ''}${drop}`}
                style={{ '--notesDepth': depth } as CSSProperties}
                draggable
                onDragStart={() => (dragId.current = id)}
                onDragEnd={() => {
                  dragId.current = null
                  setOver(null)
                }}
                onDragOver={(e) => onDragOver(e, id)}
                onDragLeave={() => over?.id === id && setOver(null)}
                onDrop={(e) => onDrop(e, id)}
              >
                <Link
                  to={`/notes/${id}`}
                  className={`notesRowLink${note.inManuscript ? '' : ' notesRowExcluded'}`}
                  draggable={false}
                  title={note.synopsis || undefined}
                  aria-expanded={hasChildren ? isOpen : undefined}
                  onClick={(e) => {
                    // Opening a note shows its children. Clicking the open note again hides them.
                    if (id !== currentId || !hasChildren) return
                    e.preventDefault()
                    saveExpanded((prev) => {
                      const next = new Set(prev)
                      if (isOpen) next.delete(id)
                      else next.add(id)
                      return next
                    })
                  }}
                >
                  {note.title || 'Untitled'}
                </Link>
                <span className="notesRowStatus" data-status={note.status} title={note.status} />
                <RowMenu
                  note={note}
                  onAddChild={() => {
                    saveExpanded((prev) => new Set([...prev, id]))
                    addChild(id)
                  }}
                />
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
