import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { newBook, useLorebooks } from '../../core/stores/lorebooksStore'
import TwoColumn from '../../app/TwoColumn'
import BookEditor from './BookEditor'

/** The file's own name, minus the extension, as the fallback book label. */
const nameOf = (file: File) => file.name.replace(/\.[^.]+$/, '')

export default function LorebooksView() {
  const { books, counts, bundledTo, loading, load, create, importFile, remove } = useLorebooks()
  const [openId, setOpenId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const { hash } = useLocation()

  useEffect(() => {
    load()
  }, [load])

  // `#book-12` opens that book: how the New book buttons elsewhere in the app link here.
  useEffect(() => {
    const id = Number(hash.match(/^#book-(\d+)$/)?.[1])
    if (id) setOpenId(id)
  }, [hash])

  const open = books.find((b) => b.id === openId) ?? null

  const bundled = books.filter((b) => bundledTo[b.id!]?.length)
  const loose = books.filter((b) => !bundledTo[b.id!]?.length)

  const row = (b: (typeof books)[number]) => (
    <li
      key={b.id}
      className={`card lorebooksListRow ${b.id === openId ? 'editing' : ''}`}
      onClick={() => setOpenId(b.id === openId ? null : (b.id ?? null))}
    >
      <span className="lorebooksName">{b.name || 'Unnamed'}</span>
      <span className="lorebooksCount">{counts[b.id!] ?? 0}</span>
      {bundledTo[b.id!]?.map((name) => (
        <span key={name} className="lorebooksBadge">
          {name}
        </span>
      ))}
      {b.global && <span className="lorebooksBadge">All chats</span>}
      <button
        type="button"
        className="danger"
        onClick={(e) => {
          e.stopPropagation()
          if (confirm(`Delete ${b.name || 'this book'} and its entries?`)) {
            if (openId === b.id) setOpenId(null)
            remove(b.id!)
          }
        }}
      >
        Delete
      </button>
    </li>
  )

  async function readFile(file: File) {
    setError('')
    try {
      const id = await importFile(await file.text(), nameOf(file))
      setOpenId(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.')
    }
  }

  return (
    <div className="lorebooks screenFrame">
      <div className="lorebooksHeader">
        <h2 className="lorebooksTitle">Lorebooks</h2>
        <button
          type="button"
          onClick={async () => setOpenId(await create({ book: newBook('New book'), entries: [] }))}
        >
          New book
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="lorebooksFileInput"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) readFile(file)
            e.target.value = '' // let the same file be picked again
          }}
        />
      </div>
      <p className="hint">
        A world info or character book JSON file. Attach a book to a character or a chat, or set it
        to apply everywhere.
      </p>

      {error && <p className="hint lorebooksError">{error}</p>}
      {loading && books.length === 0 && <p className="placeholder">Loading…</p>}
      {!loading && books.length === 0 && <p className="placeholder">No lorebooks.</p>}

      <TwoColumn
        list={
          <ul className="lorebooksList">
            {/* A header only appears when its group has rows. A library with no bundled books
                doesn't grow a heading over nothing. */}
            {bundled.length > 0 && <li className="lorebooksGroupHeader">Character Lorebooks</li>}
            {bundled.map(row)}
            {loose.length > 0 && <li className="lorebooksGroupHeader">Standalone</li>}
            {loose.map(row)}
          </ul>
        }
        detail={open && <BookEditor key={open.id} book={open} />}
      />
    </div>
  )
}
