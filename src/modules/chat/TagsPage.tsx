import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiArrowLeftLine } from '@remixicon/react'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import EntityPicker from '../../app/EntityPicker'
import TwoColumn from '../../app/TwoColumn'
import { allTags, renameTag, tagCounts } from './tags'

/**
 * Rename, delete and reassign tags across the roster. Tags are only strings on characters: there
 * is no tag record to edit. Every action here is a sweep over the characters that carry it,
 * and a tag nobody carries stops existing. The draft row for a new tag has nowhere to
 * live until a character is checked.
 */
export default function TagsPage() {
  const { characters, load, save } = useCharacters()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [rename, setRename] = useState('')

  useEffect(() => {
    load()
  }, [load])

  const tags = allTags(characters)
  const counts = tagCounts(characters)
  // The draft sits in the list beside the real ones until something is checked against it.
  const rows = draft !== null && !tags.includes(draft) ? [...tags, draft] : tags
  const active = selected !== null && rows.includes(selected) ? selected : null

  async function applyRename() {
    const to = rename.trim()
    if (active === null || !to || to === active) return
    // A draft has no members to sweep, renaming it is just retitling the unsaved row.
    if (draft === active) {
      setDraft(to)
      setSelected(to)
      return
    }
    for (const c of characters) {
      if (!c.tags?.includes(active)) continue
      await save({ ...c, tags: renameTag(c.tags, active, to) })
    }
    if (draft === active) setDraft(null)
    setSelected(to)
  }

  async function removeTag() {
    if (active === null) return
    const users = characters.filter((c) => c.tags?.includes(active))
    if (users.length && !confirm(`Remove '${active}' from ${users.length} character${users.length === 1 ? '' : 's'}?`))
      return
    for (const c of users) await save({ ...c, tags: c.tags.filter((t) => t !== active) })
    if (draft === active) setDraft(null)
    setSelected(null)
  }

  async function toggleMember(id: number) {
    const c = characters.find((x) => x.id === id)
    if (!c || !active) return
    // Appended, never prepended: assigning a tag here should not move a character out of the group
    // their first tag already puts them in.
    const next = c.tags.includes(active) ? c.tags.filter((t) => t !== active) : [...c.tags, active]
    await save({ ...c, tags: next })
    if (draft === active) setDraft(null)
  }

  const list = (
    <>
      <div className="tagsPageListHead">
        <button type="button" onClick={() => setDraft('')}>
          New tag
        </button>
      </div>
      <p className="hint">A tag exists only while a character uses it.</p>
      {rows.length === 0 && <p className="placeholder">No tags yet.</p>}
      {rows.map((tag) => (
        <button
          key={tag || '(draft)'}
          type="button"
          className={`tagsPageRow${active === tag ? ' selected' : ''}`}
          onClick={() => {
            setSelected(tag)
            setRename(tag)
          }}
        >
          <span>{tag || 'Untitled tag'}</span>
          <span className="tagsPageCount">{counts.get(tag) ?? 0}</span>
        </button>
      ))}
    </>
  )

  const detail = active === null ? undefined : (
    <>
      <div className="tagsPageDetailHead">
        <label>
          Tag name
          <input
            value={rename}
            onChange={(e) => setRename(e.target.value)}
            onBlur={applyRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
        </label>
        <button type="button" onClick={removeTag}>
          Delete
        </button>
      </div>
      <EntityPicker
        items={characters.map((c) => ({
          key: String(c.id),
          label: displayName(c) || 'Unnamed',
          avatar: c.avatar,
          avatarCrop: c.avatarCrop,
        }))}
        placeholder="Search characters"
        rows={10}
        selectedKeys={characters.filter((c) => c.tags?.includes(active)).map((c) => String(c.id))}
        onPick={(item) => toggleMember(Number(item.key))}
      />
    </>
  )

  return (
    <div className="chatPicker tagsPage screenFrame">
      <div className="chatPickerHeader">
        <button type="button" className="backButton" title="Back" onClick={() => navigate('/chat')}>
          <RiArrowLeftLine size={18} />
        </button>
        <h2>Tags</h2>
      </div>
      <TwoColumn list={list} detail={detail} />
    </div>
  )
}
