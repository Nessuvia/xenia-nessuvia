import { useState } from 'react'
import type { ReactNode } from 'react'

/**
 * A searchable checkbox list of tags. Two callers: the picker header's filter dropdown (checked =
 * filtered on) and the card context menu (checked = the character has it). Same markup, different
 * meaning of "checked": the caller owns the state and this owns the search box.
 */
export default function TagList({
  tags,
  checked,
  onToggle,
  onCreate,
  header,
  emptyText = 'No tags yet.',
}: {
  tags: string[]
  checked: string[]
  onToggle: (tag: string) => void
  /** Given, a text input appears at the bottom for adding a tag that does not exist yet. */
  onCreate?: (tag: string) => void
  /** Rendered above the list, the Any/All switch, a Clear button. */
  header?: ReactNode
  emptyText?: string
}) {
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const query = search.trim().toLowerCase()
  const matches = query ? tags.filter((t) => t.toLowerCase().includes(query)) : tags

  function create() {
    const name = draft.trim()
    if (!name) return
    setDraft('')
    // Typing a name that already exists picks it rather than silently doing nothing.
    if (tags.includes(name)) {
      if (!checked.includes(name)) onToggle(name)
    } else onCreate?.(name)
  }

  return (
    <div className="tagList">
      {header}
      {tags.length > 0 && (
        <input
          type="search"
          className="tagListSearch"
          placeholder="Search tags"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <div className="tagListRows">
        {matches.length === 0 && <p className="placeholder">{tags.length ? 'No matches.' : emptyText}</p>}
        {matches.map((tag) => (
          <label key={tag} className="tagListRow">
            <input type="checkbox" checked={checked.includes(tag)} onChange={() => onToggle(tag)} />
            <span>{tag}</span>
          </label>
        ))}
      </div>
      {onCreate && (
        <input
          className="tagListNew"
          placeholder="New tag…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            create()
          }}
          onBlur={create}
        />
      )}
    </div>
  )
}
