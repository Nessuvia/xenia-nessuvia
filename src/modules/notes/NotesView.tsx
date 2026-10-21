import { useEffect, useRef, useState } from 'react'
import { Navigate, useMatch, useNavigate } from 'react-router-dom'
import {
  RiAddLine,
  RiBookOpenLine,
  RiCheckboxBlankLine,
  RiCheckboxLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiFileTextLine,
  RiLinksLine,
} from '@remixicon/react'
import PageHeader from '../../app/PageHeader'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import { usePalette } from '../../core/stores/palettesStore'
import { useNotes } from '../../core/stores/notesStore'
import { backlinks, findLinks, renameLinks, resolveTitle } from '../../core/notes/noteLinks'
import { wordCount } from '../../core/quality/words'
import type { Note, NoteStatus } from '../../core/storage/types'
import NoteDocument from './NoteDocument'
import Manuscript from './Manuscript'
import { lastOpenKey } from './NotesTree'

const statuses: [NoteStatus, string][] = [
  ['idea', 'Idea'],
  ['draft', 'Draft'],
  ['revised', 'Revised'],
  ['done', 'Done'],
]

function DialogHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="notesDialogHead">
      <h3>{title}</h3>
      <button type="button" title="Close" aria-label="Close" onClick={onClose}>
        <RiCloseLine size={16} />
      </button>
    </div>
  )
}

/** Notes this one links to, and notes linking here. Picking one opens it. */
function LinksDialog({ note, onClose }: { note: Note; onClose: () => void }) {
  const notes = useNotes((s) => s.notes)
  const navigate = useNavigate()
  const out = [...new Set(findLinks(note.text).map((l) => l.title))]
    .map((title) => resolveTitle(notes, title))
    .filter((n) => n !== undefined)
  const incoming = backlinks(notes, note)
  const open = (id: number) => {
    onClose()
    navigate(`/notes/${id}`)
  }
  const group = (label: string, list: Note[]) =>
    list.length > 0 && (
      <div className="notesLinksGroup">
        <span className="hint">{label}</span>
        {list.map((n) => (
          <button key={n.id} type="button" className="notesLinksItem" onClick={() => open(n.id!)}>
            {n.title || 'Untitled'}
          </button>
        ))}
      </div>
    )

  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="panel dialog notesLinksDialog" onClick={(e) => e.stopPropagation()}>
        <DialogHead title="Links" onClose={onClose} />
        {!out.length && !incoming.length && <p className="hint">No linked notes. [[Note title]] links to a note.</p>}
        {group('Links to', out)}
        {group('Linked from', incoming)}
      </div>
    </div>
  )
}

/** Edits the one-line synopsis. Saved as typed. */
function SynopsisDialog({ value, onChange, onClose }: { value: string; onChange: (v: string) => void; onClose: () => void }) {
  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="panel dialog notesSynopsisDialog" onClick={(e) => e.stopPropagation()}>
        <DialogHead title="Synopsis" onClose={onClose} />
        <input
          autoFocus
          aria-label="Synopsis"
          placeholder="One line about this note."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && onClose()}
        />
      </div>
    </div>
  )
}

/** Deletes in two clicks: the first primes it, the second deletes. A click elsewhere or Escape
 *  disarms it, as in GamesView's DeleteAbandoned. */
function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [primed, setPrimed] = useState(false)
  const ref = useCloseOnOutside<HTMLButtonElement>(primed, () => setPrimed(false))
  return (
    <button
      ref={ref}
      type="button"
      className={`notesBarButton${primed ? ' danger' : ''}`}
      title={primed ? 'Click again to delete this note and the notes under it' : 'Delete'}
      aria-label={primed ? 'Confirm delete' : 'Delete'}
      onClick={() => {
        if (!primed) return setPrimed(true)
        setPrimed(false)
        onDelete()
      }}
    >
      <RiDeleteBinLine size={16} />
      {primed && 'Delete?'}
    </button>
  )
}

function NoteEditor({ note }: { note: Note }) {
  const { notes, update, rename, create, remove } = useNotes()
  const navigate = useNavigate()
  const palette = usePalette()
  const [titleDraft, setTitleDraft] = useState(note.title)
  const [showManuscript, setShowManuscript] = useState(false)
  const [dialog, setDialog] = useState<'synopsis' | 'links' | null>(null)
  const page = useRef<HTMLDivElement>(null)
  const id = note.id!

  function commitTitle() {
    const title = titleDraft.trim()
    if (title === note.title) return
    const linked = renameLinks(notes, id, note.title, title).filter((n) => n.id !== id).length
    rename(id, title, linked > 0 && confirm(`Update links to "${note.title}" in ${linked} ${linked === 1 ? 'note' : 'notes'}?`))
  }

  async function openLink(title: string) {
    const target = resolveTitle(useNotes.getState().notes, title)
    navigate(`/notes/${target ? target.id : await create(id, title)}`)
  }

  function onDelete() {
    remove(id)
    navigate(note.parentId ? `/notes/${note.parentId}` : '/notes')
  }

  return (
    <div
      className="notesEditor screenFrame"
      style={
        {
          '--storyTextColor': palette.storyTextColor || '',
          '--storyEmphasisColor': palette.storyEmphasisColor || '',
          '--storyBoldColor': palette.storyBoldColor || '',
          '--storyQuoteColor': palette.storyQuoteColor || '',
        } as React.CSSProperties
      }
    >
      <PageHeader
        title={
          <input
            className="notesTitleInput"
            value={titleDraft}
            placeholder="Untitled"
            aria-label="Title"
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              // Tab goes straight to the text, past the bar. Blurring the title commits it.
              const text = e.key === 'Tab' && !e.shiftKey && page.current?.querySelector<HTMLElement>('.cm-content')
              if (text) {
                e.preventDefault()
                text.focus()
              }
            }}
          />
        }
        actions={<span className="hint">{wordCount(note.text)} words</span>}
      />
      {/* The bar is the page's top edge, the way the Write toolbar sits on its document. */}
      <div className="notesPage" ref={page}>
        <div className="notesBar">
          <select
            className="notesBarSelect"
            aria-label="Status"
            title="Status"
            value={note.status}
            onChange={(e) => update({ ...note, status: e.target.value as NoteStatus })}
          >
            {statuses.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="notesBarButton"
            aria-pressed={note.inManuscript}
            title="Include this note and the notes under it in a manuscript"
            onClick={() => update({ ...note, inManuscript: !note.inManuscript })}
          >
            {note.inManuscript ? <RiCheckboxLine size={16} /> : <RiCheckboxBlankLine size={16} />}
            <span className="btnLabel">In manuscript</span>
          </button>
          <button type="button" className="notesBarButton" title={note.synopsis || 'Synopsis'} onClick={() => setDialog('synopsis')}>
            <RiFileTextLine size={16} />
            <span className="btnLabel">Synopsis</span>
          </button>
          <button type="button" className="notesBarButton" title="Linked notes" onClick={() => setDialog('links')}>
            <RiLinksLine size={16} />
            <span className="btnLabel">Links</span>
          </button>
          <span className="notesBarDivider" />
          <button
            type="button"
            className="notesBarButton"
            aria-pressed={showManuscript}
            title="Show this note and the notes under it as one document"
            onClick={() => setShowManuscript(!showManuscript)}
          >
            <RiBookOpenLine size={16} />
            <span className="btnLabel">Manuscript</span>
          </button>
          <span className="notesBarEnd">
            <button
              type="button"
              className="notesBarButton"
              title="Add a note under this one"
              aria-label="Add a note under this one"
              onClick={async () => navigate(`/notes/${await create(id)}`)}
            >
              <RiAddLine size={16} />
            </button>
            <DeleteButton onDelete={onDelete} />
          </span>
        </div>
        {showManuscript ? <Manuscript rootId={id} /> : <NoteDocument noteId={id} onOpenLink={openLink} />}
      </div>
      {dialog === 'synopsis' && (
        <SynopsisDialog
          value={note.synopsis}
          onChange={(synopsis) => update({ ...note, synopsis })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'links' && <LinksDialog note={note} onClose={() => setDialog(null)} />}
    </div>
  )
}

export default function NotesView() {
  const { notes, loaded, load, create } = useNotes()
  const navigate = useNavigate()
  const noteId = Number(useMatch('/notes/:noteId')?.params.noteId)

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  if (!loaded) return null
  const note = notes.find((n) => n.id === noteId)

  if (!note) {
    const last = Number(localStorage.getItem(lastOpenKey))
    if (!noteId && notes.some((n) => n.id === last)) return <Navigate to={`/notes/${last}`} replace />
    return (
      <div className="notesView screenFrame">
        <PageHeader
          title="Notes"
          actions={
            <button type="button" onClick={async () => navigate(`/notes/${await create(null)}`)}>
              <RiAddLine size={16} />
              <span className="btnLabel">New note</span>
            </button>
          }
        />
        <p className="hint">{notes.length ? 'Pick a note in the sidebar.' : 'No notes yet.'}</p>
      </div>
    )
  }

  return (
    <div className="notesView screenFrame">
      {/* Keyed: the title draft, the manuscript toggle and an open dialog belong to one note. */}
      <NoteEditor key={note.id} note={note} />
    </div>
  )
}
