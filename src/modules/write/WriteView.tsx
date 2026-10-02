import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import {
  RiAddLine,
  RiBookLine,
  RiCloseLine,
  RiCodeSSlashLine,
  RiDeleteBinLine,
  RiFileCopyLine,
  RiImageEditLine,
} from '@remixicon/react'
import AvatarCropDialog from '../characters/AvatarCropDialog'
import { exportStoryHtml, exportStoryMarkdown, exportStoryTxt } from './exportStory'
import { useWrite } from '../../core/stores/writeStore'
import { useSettings } from '../../core/stores/settingsStore'
import { useStoryRules } from '../../core/stores/textRules'
import { usePalette } from '../../core/stores/palettesStore'
import { useStacks } from '../../core/stores/stacksStore'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import { countWords } from '../../core/prompt/buildStoryPrompt'
import type { CastEntry, Story } from '../../core/storage/types'
import { useMediaQuery } from '../../app/useMediaQuery'
import { useSideDrawer } from '../../app/useSideDrawer'
import { Avatar } from '../../app/Avatar'
import PageHeader from '../../app/PageHeader'
import StoryDocument from './StoryDocument'
import StoryToolbar from './StoryToolbar'
import '../../app/sideDrawer.css'

// Landing screen: the grid of Story cover cards, plus the preview panel for the picked Story.
function Shelf() {
  const { stories, loading, load, create } = useWrite()
  const openStoryDirectly = useSettings((s) => s.openStoryDirectly)
  const setOpenStoryDirectly = useSettings((s) => s.setOpenStoryDirectly)
  const navigate = useNavigate()
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    load()
  }, [load])

  // A deleted Story leaves a preview pointing at nothing.
  useEffect(() => {
    if (previewId != null && !stories.some((s) => s.id === previewId)) setPreviewId(null)
  }, [stories, previewId])

  function onCoverClick(id: number) {
    if (openStoryDirectly) navigate(`/write/s/${id}`)
    else setPreviewId(id)
  }

  async function onCreate() {
    const title = prompt('Story title')?.trim()
    if (title == null) return
    const id = await create(title || 'Untitled Story')
    navigate(`/write/s/${id}`)
  }

  const shown = stories.filter((s) =>
    (s.title || 'Untitled Story').toLowerCase().includes(search.trim().toLowerCase()),
  )
  const preview = stories.find((s) => s.id === previewId) ?? null

  return (
    <div className="shelfLayout">
    <div className="shelf">
      <PageHeader
        title="Write"
        actions={
          <>
            <label className="shelfToggle">
              <input
                type="checkbox"
                checked={openStoryDirectly}
                onChange={(e) => {
                  setOpenStoryDirectly(e.target.checked)
                  if (e.target.checked) setPreviewId(null)
                }}
              />
              Open Story Directly
            </label>
            <input
              className="storySearch"
              placeholder="Search stories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="button" onClick={onCreate}>
              New Story
            </button>
          </>
        }
      />

      {loading && stories.length === 0 && <p className="placeholder">Loading…</p>}
      {!loading && stories.length === 0 && (
        <p className="placeholder">No Stories yet. Create one to start.</p>
      )}
      {!loading && stories.length > 0 && shown.length === 0 && (
        <p className="placeholder">No matches.</p>
      )}

      <ul className="shelfGrid">
        {shown.map((s) => (
          <li key={s.id} className={s.id === previewId ? 'storyCard selected' : 'storyCard'}>
            <button type="button" className="card storyCover" onClick={() => onCoverClick(s.id!)}>
              {s.cover ? (
                <img src={s.cover} alt="" />
              ) : (
                <span className="coverPlaceholder">
                  <RiBookLine size={40} />
                </span>
              )}
            </button>
            <span className="storyTitle">{s.title || 'Untitled Story'}</span>
          </li>
        ))}
      </ul>
    </div>

      {preview && <StoryPreview story={preview} onClose={() => setPreviewId(null)} />}
    </div>
  )
}

function stamp(ms: number): string {
  if (!ms) return '--'
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// Shelf preview panel: a bigger cover and what the Story holds, with Continue to open the editor.
//
// On a phone it's a drawer on the right edge rather than a column beside the grid. Picking a
// cover is what opens it, so a swipe from closed isn't eligible, there would be nothing in it.
// A swipe right, or the close button, sends it back out; the Story it was showing is dropped once
// it has finished leaving, so the slide out isn't cut short by the panel unmounting mid-move.
function StoryPreview({ story, onClose }: { story: Story; onClose: () => void }) {
  const palette = usePalette()
  const characters = useCharacters((s) => s.characters)
  const personas = usePersonas((s) => s.personas)
  const loadCharacters = useCharacters((s) => s.load)
  const loadPersonas = usePersonas((s) => s.load)
  const setCover = useWrite((s) => s.setCover)
  const rename = useWrite((s) => s.rename)
  const remove = useWrite((s) => s.remove)
  const duplicate = useWrite((s) => s.duplicate)
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  // null when not editing; the draft otherwise. Blur saves, an empty draft keeps the old title.
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  const phone = useMediaQuery('(max-width: 700px)')
  // Off a phone the panel is in the layout, so it counts as open and the drawer classes do
  // nothing. On a phone it mounts closed and slides in on the next frame.
  const [open, setOpen] = useState(!phone)
  const drawer = useSideDrawer({ side: 'right', enabled: phone, swipeOpen: false, open, setOpen })

  useEffect(() => {
    if (!phone) { setOpen(true); return }
    // A frame closed first: setting the class in the same paint as the mount gives the transition
    // nothing to move from.
    const id = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(id)
  }, [phone, story.id])

  // Swiping it away leaves `open` false with the panel still mounted; drop the Story once the
  // slide out has had its 220ms (sideDrawer.css). Through a ref: onClose is written inline by the
  // shelf, and a new identity per render would keep restarting the timer.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (open || !phone) return
    const id = window.setTimeout(() => closeRef.current(), 220)
    return () => window.clearTimeout(id)
  }, [open, phone])

  // The shelf never opened a Story, so the cast stores may still be empty.
  useEffect(() => {
    loadCharacters()
    loadPersonas()
  }, [loadCharacters, loadPersonas])

  useEffect(() => setTitleDraft(null), [story.id])

  // Name and avatar together: the cast list bills each member with their picture, and a deleted
  // record still gets a row so the Story's cast doesn't silently shrink.
  const memberOf = (entry: CastEntry) => {
    if (entry.kind === 'character') {
      const c = characters.find((x) => x.id === entry.id)
      return { name: c ? displayName(c) : '(deleted character)', of: c }
    }
    const p = personas.find((x) => x.id === entry.id)
    return { name: p ? p.name : '(deleted persona)', of: p }
  }

  return (
    <>
    {/* Same opaque ground the Story panel gets: the shelf grid is still behind this. */}
    {phone && <div className={`storyPanelBackdrop${open ? ' shown' : ''}`} />}
    <aside className={`panel storyPreview ${drawer.className}`} style={drawer.style}>
      <button
        type="button"
        className="storyPreviewClose"
        title="Close"
        onClick={() => (phone ? setOpen(false) : onClose())}
      >
        <RiCloseLine size={16} />
      </button>

      <button
        type="button"
        className={story.cover ? 'storyPreviewCover' : 'storyPreviewCover empty'}
        title={story.cover ? 'Replace cover' : 'Add cover'}
        onClick={() => fileInput.current?.click()}
      >
        {story.cover ? (
          <img src={story.cover} alt="" />
        ) : (
          <span className="coverPlaceholder">
            <RiAddLine size={48} />
          </span>
        )}
      </button>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          const reader = new FileReader()
          reader.onload = () => setCropSrc(String(reader.result))
          reader.readAsDataURL(file)
        }}
      />

      {cropSrc && (
        <AvatarCropDialog
          src={cropSrc}
          aspect={3 / 4}
          title="Crop cover"
          onCancel={() => setCropSrc(null)}
          onConfirm={({ dataUrl }) => {
            setCover(story.id!, dataUrl)
            setCropSrc(null)
          }}
        />
      )}

      <button
        type="button"
        className="storyPreviewContinue"
        onClick={() => navigate(`/write/s/${story.id}`)}
      >
        Continue
      </button>

      {titleDraft === null ? (
        <h3
          className="storyPreviewTitle"
          title="Rename Story"
          onClick={() => setTitleDraft(story.title)}
        >
          {story.title || 'Untitled Story'}
        </h3>
      ) : (
        <input
          className="titleEdit storyPreviewTitle"
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            rename(story.id!, titleDraft.trim() || story.title)
            setTitleDraft(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setTitleDraft(null)
          }}
        />
      )}

      <dl className="storyPreviewFacts">
        <dt>Words</dt>
        <dd>{countWords(story.text).toLocaleString()}</dd>
        <dt>Created</dt>
        <dd>{stamp(story.createdAt)}</dd>
        <dt>Last edit</dt>
        <dd>{stamp(story.updatedAt)}</dd>

        <dt className="storyCastLabel">Cast</dt>
        <dd className="storyCast">
          {story.cast.length === 0 ? (
            <span className="storyCastEmpty">None</span>
          ) : (
            story.cast.map((entry) => {
              const member = memberOf(entry)
              return (
                <span className="storyCastChip" key={`${entry.kind}:${entry.id}`} title={member.name}>
                  <Avatar of={member.of} name={member.name} className="storyCastAvatar" />
                  <span className="storyCastName">{member.name}</span>
                </span>
              )
            })
          )}
        </dd>
      </dl>

      <h4 className="storyPanelLabel">Export</h4>
      <div className="storyExportRow">
        <button type="button" onClick={() => exportStoryMarkdown(story)}>
          Markdown
        </button>
        <button type="button" onClick={() => exportStoryTxt(story)}>
          Text
        </button>
        <button type="button" onClick={() => exportStoryHtml(story, palette)}>
          HTML
        </button>
      </div>

      <h4 className="storyPanelLabel">Misc Options</h4>
      <div className="storyPreviewActions">
        {story.cover && (
          <button type="button" onClick={() => setCover(story.id!, '')}>
            <RiImageEditLine size={16} />
            Clear cover
          </button>
        )}
        <button type="button" onClick={() => duplicate(story.id!)}>
          <RiFileCopyLine size={16} />
          Copy
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (confirm(`Delete ${story.title || 'this Story'}?`)) remove(story.id!)
          }}
        >
          <RiDeleteBinLine size={16} />
          Delete
        </button>
      </div>
    </aside>
    </>
  )
}

const rawViewKey = 'nessuTavern.storyRawView'

function StoryEditor() {
  const { storyId } = useParams()
  const id = Number(storyId)
  const story = useWrite((s) => s.story)
  const openStory = useWrite((s) => s.openStory)
  const closeStory = useWrite((s) => s.closeStory)
  const error = useWrite((s) => s.error)
  const dismissError = useWrite((s) => s.dismissError)
  const rename = useWrite((s) => s.rename)
  const unsaved = useWrite((s) => s.unsaved)
  const palette = usePalette()
  // null while showing the title; a string while editing it.
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  // Pretty or raw. A preference of this browser, kept out of a backup.
  const [raw, setRaw] = useState(() => localStorage.getItem(rawViewKey) === '1')
  const { replaceRules } = useStoryRules(story)

  useEffect(() => {
    openStory(id)
    // The toolbar's length control reads the stack, so it has to exist before the first send.
    useStacks.getState().ensureActive('story')
    return () => closeStory()
  }, [id, openStory, closeStory])

  if (!story || story.id !== id) return <p className="placeholder">Loading…</p>

  return (
    // Visual settings arrive as CSS vars, same pattern as the chat's. An empty value falls through
    // to the var's fallback in write.css, so "unset" costs nothing.
    <div
      className="storyEditor"
      style={
        {
          // The Story's own width wins over the palette's default.
          '--storyWidth': `${story.storyWidth ?? palette.storyWidth}%`,
          '--storyTextColor': palette.storyTextColor || '',
          '--storyEmphasisColor': palette.storyEmphasisColor || '',
          '--storyBoldColor': palette.storyBoldColor || '',
          '--storyQuoteColor': palette.storyQuoteColor || '',
        } as React.CSSProperties
      }
    >
      <div className="storyMain">
        <div className="storyBar">
          {titleDraft === null ? (
            <h2 onClick={() => setTitleDraft(story.title)} title="Rename Story">
              {story.title || 'Untitled Story'}
            </h2>
          ) : (
            <input
              className="titleEdit"
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                rename(id, titleDraft.trim() || 'Untitled Story')
                setTitleDraft(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setTitleDraft(null)
              }}
            />
          )}
          <div className="storyBarEnd">
            {!unsaved && <span className="hint">Saved</span>}
            <button
              type="button"
              className="storyRawToggle"
              aria-pressed={raw}
              title={raw ? 'Show formatted text' : 'Show raw text'}
              onClick={() => {
                localStorage.setItem(rawViewKey, raw ? '0' : '1')
                setRaw(!raw)
              }}
            >
              <RiCodeSSlashLine size={18} />
            </button>
          </div>
        </div>
        {/* One column at the reading width: the toolbar sits on the page it acts on. */}
        <div className="storyPage">
          <StoryToolbar />
          <StoryDocument raw={raw} replaceRules={replaceRules} />
        </div>
      </div>
      {error && (
        <div className="writeToast" role="alert">
          <span className="writeToastText">{error}</span>
          <button type="button" className="writeToastClose" onClick={dismissError} title="Dismiss">
            <RiCloseLine size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

export default function WriteView() {
  return (
    <Routes>
      <Route index element={<Shelf />} />
      <Route path="s/:storyId" element={<StoryEditor />} />
      <Route path="*" element={<Navigate to="/write" replace />} />
    </Routes>
  )
}
