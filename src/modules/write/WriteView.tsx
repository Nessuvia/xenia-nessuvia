import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import {
  RiAddLine,
  RiArrowDownSLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiBookLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiFileCopyLine,
  RiImageEditLine,
  RiItalic,
  RiMapPinLine,
  RiMoreLine,
  RiSparkling2Line,
  RiStopCircleLine,
} from '@remixicon/react'
import AvatarCropDialog from '../characters/AvatarCropDialog'
import { decorateProse, readProse, restoreCaret, saveCaret } from './proseMarkup'
import { loremParagraphs } from './loremPreview'
import { exportStoryHtml, exportStoryJson, exportStoryTxt } from './exportStory'
import { newBlock, useWrite } from '../../core/stores/writeStore'
import { instructionChain, reasoningFor, swipeCount, swipeIndex } from '../../core/stores/swipes'
import { beatTargets } from '../../core/prompt/beatWeights'
import { WeightPicker } from './WeightPicker'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import { useSettings, type MarkerKind } from '../../core/stores/settingsStore'
import { usePalette } from '../../core/stores/palettesStore'
import { effectiveFont } from '../../core/palette/palette'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import type { BeatWeight, Block, BlockContext, CastEntry, Chapter, Story } from '../../core/storage/types'
import { StoryBeats } from './StoryRail'
import PlotLayout from './PlotLayout'
import { useMediaQuery } from '../../app/useMediaQuery'
import { useSideDrawer } from '../../app/useSideDrawer'
import { CollapseButton } from '../../app/CollapseButton'
import { Avatar } from '../../app/Avatar'
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
      <div className="shelfHeader">
        <h2>Write</h2>
        <div className="shelfHeaderRight">
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
        </div>
      </div>

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
// On a phone it is a drawer on the right edge rather than a column beside the grid. Picking a
// cover is what opens it, so a swipe from closed is not eligible, there would be nothing in it.
// A swipe right, or the close button, sends it back out; the Story it was showing is dropped once
// it has finished leaving, so the slide out isn't cut short by the panel unmounting mid-move.
function StoryPreview({ story, onClose }: { story: Story; onClose: () => void }) {
  const wordCount = useWrite((s) => s.wordCount)
  const chaptersOf = useWrite((s) => s.chaptersOf)
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
  const [words, setWords] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  // null when not editing; the draft otherwise. Blur saves, an empty draft keeps the old title.
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  const phone = useMediaQuery('(max-width: 700px)')
  // Off a phone the panel is simply in the layout, so it counts as open and the drawer classes do
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

  useEffect(() => {
    let live = true
    setWords(null)
    setTitleDraft(null)
    wordCount(story.id!).then((n) => {
      if (live) setWords(n)
    })
    return () => {
      live = false
    }
  }, [story.id, wordCount])

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
        <dd>{words == null ? '…' : words.toLocaleString()}</dd>
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
        {/* Chapters are fetched per click rather than held in state: the shelf never loads them,
            and an export is rare enough that one read on demand is cheaper than keeping them. */}
        <button type="button" onClick={() => chaptersOf(story.id!).then((cs) => exportStoryJson(story, cs))}>
          JSON
        </button>
        <button type="button" onClick={() => chaptersOf(story.id!).then((cs) => exportStoryTxt(story, cs))}>
          Text
        </button>
        <button
          type="button"
          onClick={() => chaptersOf(story.id!).then((cs) => exportStoryHtml(story, cs, palette))}
        >
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

/** Streaming *into the Story that's open*. A generation left running while the Author opened
 *  another Story keeps going, but its tail belongs to the other document, not this one. */
const streamingHere = (s: { streaming: boolean; streamingStoryId: number | null; story: { id?: number } | null }) =>
  s.streaming && s.streamingStoryId === s.story?.id

const contextLabels: Record<BlockContext, string> = {
  both: 'Prose before and after',
  before: 'Prose before only',
  after: 'Prose after only',
  none: 'No surrounding prose',
}

// a context rather than threading a callback through StoryDocument → ChapterRegion →
// BlockRegion → BlockHead, none of which have anything else to say about tabs.
const JumpToPlot = createContext<(chapterId: number, beatId: string) => void>(() => {})

// Regen with instructions. Reuses .dialogBackdrop / .dialog / .dialogActions from chat.css. The
// length sits here because a rewrite is the moment the Author notices the beat came out too short.
function RegenDialog({
  label,
  weight,
  words,
  chain,
  onClose,
  onRegen,
}: {
  label: string
  weight: BeatWeight
  /** The words this beat works out to at the weight below. Derived, so it moves as the weight does. */
  words: number
  /** Every instruction that led to the version on screen, oldest first. Shown because they are sent
   *  again alongside whatever is typed here: a regen carries them, it does not start over. */
  chain: string[]
  onClose: () => void
  onRegen: (instruction: string, weight: BeatWeight) => void
}) {
  const [instruction, setInstruction] = useState('')
  const [draft, setDraft] = useState(weight)

  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="dialog regenDialog" onClick={(e) => e.stopPropagation()}>
        <h3>Regen with instructions</h3>
        <p className="hint">{label}</p>
        {chain.length > 0 && (
          <div className="regenChain">
            <p className="hint">Already asked for, and sent again:</p>
            <ol className="regenChainList">
              {chain.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ol>
          </div>
        )}
        <textarea
          rows={8}
          autoFocus
          value={instruction}
          placeholder="What should change?"
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && instruction.trim()) {
              e.preventDefault()
              onRegen(instruction.trim(), draft)
            }
          }}
        />
        <div className="regenTarget">
          <label>
            Length
            <WeightPicker
              value={draft}
              words={weight === draft ? words : 0}
              onChange={setDraft}
            />
          </label>
        </div>
        <div className="dialogActions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={!instruction.trim()} onClick={() => onRegen(instruction.trim(), draft)}>
            Regen
          </button>
        </div>
      </div>
    </div>
  )
}

// The header above a beat: its plan line, and every control that acts on the Block.
function BlockHead({
  block,
  chapterId,
  chapterIndex,
  beatIndex,
  targetWords,
  onPatch,
  onRemove,
  preview,
  onPreview,
  collapsed,
  onCollapse,
}: {
  block: Block
  chapterId: number
  chapterIndex: number
  beatIndex: number
  /** This beat's share of its Chapter's word target. Derived from the weights, never stored. */
  targetWords: number
  // Returns the store write, so the regen dialog can land a weight change before it asks for prose.
  onPatch: (patch: Partial<Block>) => void | Promise<void>
  onRemove: () => void
  preview: boolean
  onPreview: (on: boolean) => void
  collapsed: boolean
  onCollapse: (on: boolean) => void
}) {
  const streaming = useWrite((s) => s.streaming)
  const streamingHere = useWrite((s) => s.streaming && s.streamingBlockId === block.id)
  const stop = useWrite((s) => s.stop)
  const writeBlock = useWrite((s) => s.writeBlock)
  const regenBlock = useWrite((s) => s.regenBlock)
  const swipeBlock = useWrite((s) => s.swipeBlock)
  const deleteSwipe = useWrite((s) => s.deleteSwipe)
  const [menu, setMenu] = useState(false)
  const [regenOpen, setRegen] = useState(false)
  const menuRef = useCloseOnOutside<HTMLDivElement>(menu, () => setMenu(false))
  const jumpToPlot = useContext(JumpToPlot)

  // The beat field is always a textarea, there is no read mode to swap out of, which is what used
  // to reflow the text on click. Local draft with a debounced save, the same reason PlotLayout's
  // BeatText keeps one: onPatch awaits a Dexie write, so a controlled value lands a render late
  // and React puts the caret back at the end of the line.
  const [draft, setDraft] = useState(() => block.beat)
  const timer = useRef<number | undefined>(undefined)
  const stored = block.beat
  const lastSeen = useRef(stored)
  // Re-seed when the beat changes underneath the field (swipe, bulk add, another surface editing
  // it) but never on the store echo of what was just typed here.
  if (stored !== lastSeen.current) {
    lastSeen.current = stored
    if (stored !== draft) setDraft(stored)
  }

  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current)
    },
    [],
  )

  function editBeat(text: string) {
    setDraft(text)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      lastSeen.current = text
      onPatch({ beat: text })
    }, 400)
  }

  function flushBeat() {
    window.clearTimeout(timer.current)
    timer.current = undefined
    if (draft === stored) return
    lastSeen.current = draft
    onPatch({ beat: draft })
  }

  const total = swipeCount(block)
  const at = swipeIndex(block)
  const crumb = `Chapter ${chapterIndex + 1} · Beat ${beatIndex + 1}`
  // RegenDialog names the beat it is about to rewrite, so it wants the whole line.
  const label = `${crumb}: ${block.beat.trim() || 'Empty beat'}`

  async function regen(instruction: string, weight: BeatWeight) {
    setRegen(false)
    // The target is derived off the stored Block when the prompt is built, so a weight change has
    // to land first; onPatch returns the store write for exactly this.
    if (weight !== block.weight) await onPatch({ weight })
    regenBlock(chapterId, block.id, instruction)
  }

  return (
    <div className="blockHead" contentEditable={false}>
      {/* The beat's name plate. Nothing here is editable, so it never moves. */}
      <div className="blockPlan">
        <span className="blockCrumb">{crumb}</span>
        {targetWords > 0 && <span className="blockTarget">{targetWords}w</span>}
      </div>

      {/* The beat is written here, so a plan change doesn't mean a trip to the Plot Layout tab. */}
      <textarea
        className="blockBeat"
        value={draft}
        placeholder="What happens in this beat"
        onChange={(e) => editBeat(e.target.value)}
        onBlur={flushBeat}
      />

      {/* Every control that acts on the Block, on its own row under the plan line. */}
      <div className="blockTools">
      {total > 1 && (
        <span className="blockSwipes">
          <button
            type="button"
            title="Previous version"
            disabled={at === 0 || streaming}
            onClick={() => swipeBlock(chapterId, block.id, at - 1)}
          >
            <RiArrowLeftSLine size={21} />
          </button>
          {at + 1}/{total}
          <button
            type="button"
            title="Next version"
            disabled={at === total - 1 || streaming}
            onClick={() => swipeBlock(chapterId, block.id, at + 1)}
          >
            <RiArrowRightSLine size={21} />
          </button>
        </span>
      )}

      {/* What this version was asked to be. Without it a swipe strip is a count of takes with no
          way to tell them apart. */}
      {total > 1 && block.instructions?.[at] && (
        <span className="blockSwipeNote" title={block.instructions[at]}>
          {block.instructions[at]}
        </span>
      )}

      {streamingHere ? (
        <button type="button" className="blockWrite" title="Stop writing. The text so far is kept." onClick={stop}>
          <RiStopCircleLine size={21} />
        </button>
      ) : (
        <button
          type="button"
          className="blockWrite"
          disabled={streaming}
          title={
            streaming
              ? 'Available when the Co-Writer stops writing.'
              : total > 1 || block.content.trim()
                ? 'Write this beat again as a new version.'
                : 'Write this beat.'
          }
          onClick={() => writeBlock(chapterId, block.id)}
        >
          <RiSparkling2Line size={21} />
        </button>
      )}

      <button
        type="button"
        className="blockJump"
        disabled={streaming}
        title={
          streaming
            ? 'Available when the Co-Writer stops writing.'
            : 'Jump to Plot Editor: open the Plot Layout tab at this beat.'
        }
        onClick={() => jumpToPlot(chapterId, block.id)}
      >
        <RiMapPinLine size={21} />
      </button>

      <button
        type="button"
        className="blockCollapse"
        title={collapsed ? 'Show this beat' : 'Hide this beat'}
        onClick={() => onCollapse(!collapsed)}
      >
        {collapsed ? <RiArrowRightSLine size={21} /> : <RiArrowDownSLine size={21} />}
      </button>

      <div className="blockMenu" ref={menuRef}>
        <button type="button" title="More" onClick={() => setMenu(!menu)}>
          <RiMoreLine size={21} />
        </button>
        {menu && (
          <div className="blockMenuPop panel">
            <button
              type="button"
              disabled={streaming}
              onClick={() => {
                setMenu(false)
                setRegen(true)
              }}
            >
              Regen with instructions
            </button>
            <label>
              Context
              <select
                value={block.context}
                title="How much of the surrounding prose this beat is written against."
                onChange={(e) => onPatch({ context: e.target.value as BlockContext })}
              >
                {(Object.keys(contextLabels) as BlockContext[]).map((k) => (
                  <option key={k} value={k}>
                    {contextLabels[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="blockMenuPreview">
              Preview word count
              <input
                type="checkbox"
                checked={preview}
                disabled={targetWords <= 0}
                title={
                  targetWords > 0
                    ? 'Fill an empty beat with placeholder text as long as the target.'
                    : "Set the Chapter's word target first."
                }
                onChange={(e) => onPreview(e.target.checked)}
              />
            </label>
            <label className="blockMenuTarget">
              Length
              <WeightPicker
                value={block.weight}
                words={targetWords}
                onChange={(weight) => onPatch({ weight })}
              />
            </label>
            <button
              type="button"
              className="danger"
              disabled={streaming}
              onClick={() => {
                setMenu(false)
                deleteSwipe(chapterId, block.id)
              }}
            >
              Delete Swipe
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                setMenu(false)
                onRemove()
              }}
            >
              Delete Beat
            </button>
          </div>
        )}
      </div>
      </div>

      {regenOpen && (
        <RegenDialog
          label={label}
          weight={block.weight}
          words={targetWords}
          chain={instructionChain(block)}
          onClose={() => setRegen(false)}
          onRegen={regen}
        />
      )}
    </div>
  )
}

// One Block's region: a contenteditable holding that Block's raw prose. Uncontrolled, the DOM is
// the source of truth for typing; React only re-syncs it when the Block's rev changes (open,
// generation, swipe), so a keystroke never triggers a re-render that would move the caret.
//
// Inline markers (italics/bold/quotes) are decorated in place by proseMarkup, never by React. The
// markers stay in the DOM as their own spans and are only hidden with CSS, so reading the prose back
// out still yields exactly what the Author typed, the Block never loses an asterisk. Toggle
// Styling flips a class; it doesn't re-parse.
//
// Decoration runs on the same debounced tick as the save rather than per keystroke, rebuilding the
// DOM under a live caret is the fragile part, and doing it while typing has paused keeps the caret
// restore to one predictable moment.
//
// Backspace at the very start of a region is swallowed: Blocks merge only by deleting one, and the
// box edge above is not content that could be backspaced away.
function BlockRegion({
  block,
  chapterId,
  chapterIndex,
  beatIndex,
  targetWords,
  first,
  onPatch,
  onRemove,
}: {
  block: Block
  chapterId: number
  chapterIndex: number
  beatIndex: number
  /** This beat's share of its Chapter's word target. Derived from the weights, never stored. */
  targetWords: number
  first: boolean
  onPatch: (patch: Partial<Block>) => void | Promise<void>
  onRemove: () => void
}) {
  const id = block.id
  const rev = useWrite((s) => s.revs[id] ?? 0)
  const streamingText = useWrite((s) => s.streamingText)
  const streamingReasoning = useWrite((s) => s.streamingReasoning)
  // One switch for the whole app, shared with chat - there is no per-beat toggle.
  const showReasoning = useSettings((s) => s.appearance.showReasoning)
  const takingStream = useWrite((s) => streamingHere(s) && s.streamingBlockId === id)
  // A regen replaces the Block, so the old text goes off screen the moment the stream starts -
  // leaving it above the tail looks like if the new prose were being appended to it.
  const replacing = useWrite((s) => s.streamingReplaces)
  const saveBlockText = useWrite((s) => s.saveBlockText)
  const setActiveBlock = useWrite((s) => s.setActiveBlock)
  // Which marker color wins is baked into the DOM at decoration time, so a reorder has to rebuild
  // it. The colors themselves are CSS vars and repaint on their own.
  const colorOrder = usePalette().storyColorOrder
  // usePalette rebuilds the array when the palette changes, so the effect below keys off contents.
  const orderKey = colorOrder.join(',')
  const decoratedOrder = useRef(orderKey)
  const ref = useRef<HTMLDivElement>(null)
  const tail = useRef<HTMLSpanElement>(null)
  const timer = useRef<number | undefined>(undefined)
  // The text the DOM was last decorated against, so a pause that changed nothing doesn't rebuild
  // the editor (and jog the caret) for no reason.
  const decorated = useRef('')
  // Own undo/redo: decorateProse rebuilds the DOM, which throws away the browser's native undo
  // stack, so Ctrl-Z has nothing to restore. We snapshot each committed state instead.
  // per-Block, capped at 200 states; a Story-wide stack is the upgrade path.
  const history = useRef<{ text: string; caret: number }[]>([])
  const histIndex = useRef(-1)
  // Preview Word Count: per-beat and deliberately not persisted, it's a ruler you hold up while
  // setting a target, not a property of the beat. a Block field is the upgrade path if
  // Authors want it to survive a reload.
  const [preview, setPreview] = useState(false)
  // Display only, not persisted, see writeStore.collapsedBeats. It lives in the store rather than
  // here so the rail's beat list can show the same state and fold them in bulk.
  const collapsedBeats = useWrite((s) => s.collapsedBeats)
  const collapsed = collapsedBeats.includes(id)
  const setCollapsed = (on: boolean) =>
    useWrite
      .getState()
      .setCollapsedBeats(on ? [...collapsedBeats, id] : collapsedBeats.filter((b) => b !== id))
  const empty = !block.content.trim()
  // Reshuffles whenever the target changes, which is what makes typing a new number redraw at the
  // new length. Nothing else in this component re-renders per keystroke, so the text sits still
  // while the Author writes.
  const previewText = useMemo(
    () => (preview && empty ? loremParagraphs(targetWords) : ''),
    [preview, empty, targetWords],
  )

  // Re-sync the DOM only on out-of-band changes (open, generation, swipe), not on every keystroke.
  useLayoutEffect(() => {
    if (ref.current && readProse(ref.current) !== block.content) {
      decorateProse(ref.current, block.content, colorOrder)
      decorated.current = block.content
    }
    // Open or an out-of-band commit reseeds history, undo doesn't cross those boundaries.
    history.current = [{ text: block.content, caret: 0 }]
    histIndex.current = 0
    // A commit or a swipe hands over where the caret should land; the rebuild above would otherwise
    // have left it at the start. Read straight off the store rather than subscribing: this is a
    // one-shot handover, not something the region should re-render for.
    const pending = useWrite.getState().pendingCaret
    if (ref.current && pending && pending.blockId === id) {
      ref.current.focus()
      restoreCaret(ref.current, pending.offset)
      useWrite.setState({ pendingCaret: null })
    }
  }, [rev, id])

  // A color reorder repaints prose that is already on screen, caret kept where the Author left it.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || decoratedOrder.current === orderKey) return
    decoratedOrder.current = orderKey
    const caret = saveCaret(el)
    decorateProse(el, readProse(el), orderKey.split(',') as MarkerKind[])
    if (caret !== null) restoreCaret(el, caret)
  }, [orderKey])

  // When the region goes away mid-debounce, flush rather than drop: the timer must not fire against
  // a detached node, but the keystrokes it was holding are still the Author's.
  useEffect(() => {
    const el = ref.current
    return () => {
      if (timer.current === undefined) return
      window.clearTimeout(timer.current)
      timer.current = undefined
      if (el) saveBlockText(chapterId, id, readProse(el))
    }
  }, [saveBlockText, chapterId, id])

  // The streaming tail isn't editable, so it can be decorated freely as it grows.
  useLayoutEffect(() => {
    if (tail.current) decorateProse(tail.current, streamingText, colorOrder)
  }, [streamingText, takingStream, orderKey])

  function onInput() {
    window.clearTimeout(timer.current)
    const el = ref.current
    if (!el) return
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      // Read at fire time, not when the timer was set, an IME commit or a paste can land between.
      const text = readProse(el)
      saveBlockText(chapterId, id, text)
      if (text === decorated.current) return
      decorated.current = text
      const caret = saveCaret(el)
      decorateProse(el, text, colorOrder)
      if (caret !== null) restoreCaret(el, caret)
      // Drop any redo branch, then record this committed state.
      history.current = history.current.slice(0, histIndex.current + 1)
      history.current.push({ text, caret: caret ?? 0 })
      if (history.current.length > 200) history.current.shift()
      histIndex.current = history.current.length - 1
    }, 800)
  }

  function applyHistory(i: number) {
    const el = ref.current
    if (!el || i < 0 || i >= history.current.length) return
    window.clearTimeout(timer.current)
    timer.current = undefined
    histIndex.current = i
    const { text, caret } = history.current[i]
    decorated.current = text
    decorateProse(el, text, colorOrder)
    restoreCaret(el, caret)
    saveBlockText(chapterId, id, text)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y')) {
      e.preventDefault()
      const redo = e.key === 'y' || (e.key === 'z' && e.shiftKey)
      applyHistory(histIndex.current + (redo ? 1 : -1))
      return
    }
    if (e.key !== 'Backspace') return
    const el = ref.current
    const sel = window.getSelection()
    if (!el || !sel || !sel.isCollapsed || sel.rangeCount === 0) return
    // Nothing between the region's start and the caret means Backspace would reach for the boundary.
    const range = sel.getRangeAt(0).cloneRange()
    range.setStart(el, 0)
    if (range.toString().length === 0) e.preventDefault()
  }

  return (
    <div
      className={`blockRegion beat${previewText ? ' previewing' : ''}${
        collapsed ? ' collapsed' : ''
      }`}
    >
      <BlockHead
        block={block}
        chapterId={chapterId}
        chapterIndex={chapterIndex}
        beatIndex={beatIndex}
        targetWords={targetWords}
        onPatch={onPatch}
        onRemove={onRemove}
        preview={preview}
        onPreview={setPreview}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />
      {showReasoning && (takingStream ? streamingReasoning : reasoningFor(block)) && (
        <details className="taggedBlock reasoningBlock" contentEditable={false}>
          <summary>Reasoning</summary>
          {takingStream ? streamingReasoning : reasoningFor(block)}
        </details>
      )}
      <div
        ref={ref}
        className={takingStream && replacing ? 'storyProse replaced' : 'storyProse'}
        data-block={id}
        contentEditable={!takingStream}
        suppressContentEditableWarning
        spellCheck
        onInput={onInput}
        onKeyDown={onKeyDown}
        onFocus={() => setActiveBlock(chapterId, id)}
        data-placeholder={
          previewText
            ? ''
            : first
              ? 'Start writing, or press Direct to have the Co-Writer open the Story.'
              : 'Write this beat, or press the spark to have the Co-Writer generate it.'
        }
      />
      {previewText && (
        // Its own element rather than the region's placeholder: `:empty` stops matching the moment
        // the browser drops a <br> into a contenteditable, which is too fragile to hang a feature
        // on. The region collapses to nothing while this shows (write.css), so the placeholder
        // prose starts exactly where real prose would.
        <div className="blockPreview" contentEditable={false}>
          {previewText}
        </div>
      )}
      {takingStream && (
        // The streaming region: locked (not editable) so only the tail is off-limits while the
        // Author edits other Blocks. Committed onto the Block when generation finishes.
        <div className="streamingTail" contentEditable={false}>
          {/* Filled by decorateProse, so the tail formats as it arrives. */}
          <span ref={tail} />
          <span className="caret">▌</span>
        </div>
      )}
    </div>
  )
}

// The thin strip between two Blocks. Hidden until hovered (write.css), it sits in the middle of a
// document being read.
function BlockGap({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="blockGap" contentEditable={false}>
      <button type="button" title="Add a beat here" onClick={onAdd}>
        <RiAddLine size={18} /> Beat
      </button>
    </div>
  )
}

// One Chapter: its divider, then its Blocks in order. The Chapter itself holds no prose, a Block
// does, so this is a mapper plus the structural edits that act on the `blocks` array.
function ChapterRegion({ chapter, index }: { chapter: Chapter; index: number }) {
  const id = chapter.id!
  const updateChapter = useWrite((s) => s.updateChapter)
  const blocks = chapter.blocks

  // A Chapter with no beats is the ordinary state of one that has not been outlined; the Plot
  // Layout offers to generate them, and the gap button adds one by hand.
  const setBlocks = (next: Block[]) => updateChapter(id, { blocks: next })
  const targets = beatTargets(chapter)

  const patch = (blockId: string, p: Partial<Block>) =>
    setBlocks(blocks.map((b) => (b.id === blockId ? { ...b, ...p } : b)))

  function remove(block: Block) {
    if (!confirm('Delete this beat and the prose in it?')) return
    setBlocks(blocks.filter((b) => b.id !== block.id))
  }

  function addAfter(blockId: string | null) {
    const at = blockId === null ? -1 : blocks.findIndex((b) => b.id === blockId)
    const next = [...blocks]
    next.splice(at + 1, 0, newBlock())
    setBlocks(next)
  }

  return (
    <div className="chapterRegion">
      {/* Not content: a real element between two regions, outside every editable surface, so no
          Block's stored text ever holds a marker to corrupt. */}
      {index > 0 && (
        <div className="chapterDivider" contentEditable={false}>
          <span>{chapter.title || `Chapter ${index + 1}`}</span>
        </div>
      )}
      <BlockGap onAdd={() => addAfter(null)} />
      {blocks.map((block, i) => {
        return (
          <Fragment key={block.id}>
            <BlockRegion
              block={block}
              chapterId={id}
              chapterIndex={index}
              beatIndex={i}
              targetWords={targets[i] ?? 0}
              first={index === 0 && i === 0}
              onPatch={(p) => patch(block.id, p)}
              onRemove={() => remove(block)}
            />
            <BlockGap onAdd={() => addAfter(block.id)} />
          </Fragment>
        )
      })}
    </div>
  )
}

// The document: one region per Chapter, stacked, dividers drawn between them. It looks like one
// continuous page, prose, a rule carrying the Chapter title, more prose.
function StoryDocument() {
  const chapters = useWrite((s) => s.chapters)
  const streaming = useWrite(streamingHere)
  const streamingText = useWrite((s) => s.streamingText)
  const styling = useWrite((s) => s.styling)
  const palette = usePalette()
  const streamingBlockId = useWrite((s) => s.streamingBlockId)

  // Follow the block being written, not the end of the document, a beat generated mid-Story used
  // to scroll the Author to the bottom. Only nudge when the block's tail has slipped just below the
  // fold; if it is further off than a screen the Author has scrolled away on purpose, so leave it.
  useEffect(() => {
    if (!streaming) return
    const el = document.querySelector<HTMLElement>('.storyMain')
    // The region, not its prose: a regen hides the prose (`.replaced`), so its rect would be empty.
    const tail = document
      .querySelector<HTMLElement>(`.storyProse[data-block="${streamingBlockId}"]`)
      ?.closest<HTMLElement>('.blockRegion')
    if (!el || !tail) return
    const overflow = tail.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom
    if (overflow > 0 && overflow < el.clientHeight) el.scrollTop += overflow + 24
  }, [streaming, streamingText, streamingBlockId])

  const proseStyle = {
    fontFamily: effectiveFont(palette) || undefined,
    fontSize: `${palette.fontSize}px`,
    // A var rather than `lineHeight`: the prose rules set their own, which would win over an
    // inherited value.
    '--storyLineHeight': palette.lineHeight || '',
  } as React.CSSProperties

  return (
    // showMarkers is the off state of Toggle Styling: the marker spans stop being hidden and the
    // bold/italic rules stop applying, so the prose looks like the raw text it actually is.
    <div className={`chapterEditor${styling ? '' : ' showMarkers'}`} style={proseStyle}>
      {chapters.map((chapter, i) => (
        <ChapterRegion key={chapter.id} chapter={chapter} index={i} />
      ))}
    </div>
  )
}

// The Chapter rail above the prose: where in the Story the cursor is, and a way to jump. Compact
// no beats; the plan is the Plot Layout tab's job. One slot, one job.
//
// The collapsed state is global rather than per Story: whether the rail shows is a working
// preference, not a property of a Story. Per Story would be the upgrade path.
function ProgressRail() {
  const chapters = useWrite((s) => s.chapters)
  const activeChapterId = useWrite((s) => s.activeChapterId)
  const setActiveChapter = useWrite((s) => s.setActiveChapter)
  const collapsed = useSettings((s) => s.railCollapsed)
  const setRailCollapsed = useSettings((s) => s.setRailCollapsed)

  if (chapters.length === 0) return null
  const activeIndex = chapters.findIndex((c) => c.id === activeChapterId)
  const shown = activeIndex === -1 ? chapters.length : activeIndex + 1

  // One action, not two: the block jumps the document and takes the cursor with it. The Chapter
  // holds no prose itself, so it lands in the Chapter's first Block.
  function jump(id: number) {
    setActiveChapter(id)
    const first = chapters.find((c) => c.id === id)?.blocks[0]
    if (!first) return
    const el = document.querySelector<HTMLElement>(`.storyProse[data-block="${first.id}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center' })
    el.focus()
  }

  return (
    <div className={`progressRail${collapsed ? ' shut' : ''}`}>
      <span className="progressRailCount">
        Ch {shown} of {chapters.length}
      </span>
      {!collapsed && (
        <ul className="progressRailBlocks">
          {chapters.map((chapter, i) => (
            <li key={chapter.id}>
              <button
                type="button"
                className={chapter.id === activeChapterId ? 'progressBlock current' : 'progressBlock'}
                title={chapter.title.trim() || `Chapter ${i + 1}`}
                onClick={() => jump(chapter.id!)}
              >
                {i + 1}
              </button>
            </li>
          ))}
        </ul>
      )}
      <CollapseButton
        label="Chapter rail"
        collapsed={collapsed}
        onToggle={() => setRailCollapsed(!collapsed)}
      />
    </div>
  )
}

type StoryTab = 'Story' | 'Plot Layout'

function StoryEditor() {
  const { storyId } = useParams()
  const id = Number(storyId)
  const story = useWrite((s) => s.story)
  const openStory = useWrite((s) => s.openStory)
  const closeStory = useWrite((s) => s.closeStory)
  const error = useWrite((s) => s.error)
  const dismissError = useWrite((s) => s.dismissError)
  const styling = useWrite((s) => s.styling)
  const toggleStyling = useWrite((s) => s.toggleStyling)
  const rename = useWrite((s) => s.rename)
  const writeBlock = useWrite((s) => s.writeBlock)
  const streaming = useWrite((s) => s.streaming)
  const palette = usePalette()
  // null while showing the title; a string while editing it.
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  // Local, not the hash: reopening a Story always lands on Story.
  const [tab, setTab] = useState<StoryTab>('Story')
  // Which beat the Plot Layout tab should open on, set by the Story tab's jump button.
  const [focusBeat, setFocusBeat] = useState<{ chapterId: number; beatId: string } | null>(null)

  useEffect(() => {
    openStory(id)
    return () => closeStory()
  }, [id, openStory, closeStory])

  // Escape cancels wherever you are, the Stop buttons only exist next to the beat and on the
  // rail's beat row, and generation can be started from a tab that shows neither.
  useEffect(() => {
    if (!streaming) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useWrite.getState().stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [streaming])

  // The tab moves first, so the Block's region is mounted before the stream starts and the caret
  // handover lands in a live DOM.
  function onWriteBeat(chapterId: number, blockId: string) {
    setTab('Story')
    requestAnimationFrame(() => writeBlock(chapterId, blockId))
  }

  function onJumpToPlot(chapterId: number, blockId: string) {
    setFocusBeat({ chapterId, beatId: blockId })
    setTab('Plot Layout')
  }

  // Same handover as onWriteBeat: the tab moves first so the Block's region exists to scroll to.
  function onJumpToStory(blockId: string) {
    setFocusBeat(null)
    setTab('Story')
    requestAnimationFrame(() =>
      document
        .querySelector(`.storyProse[data-block="${blockId}"]`)
        ?.scrollIntoView({ block: 'center' }),
    )
  }

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
          {/* In-page tabs, not module `tabs`: those deep-link the shelf, and the sidebar swaps to
              the Story rail when a Story is open. */}
          <div className="storyTabs" role="tablist">
            {(['Story', 'Plot Layout'] as StoryTab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={tab === t ? 'storyTab current' : 'storyTab'}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === 'Story' && (
            <button
              type="button"
              className={`stylingToggle${styling ? ' on' : ''}`}
              aria-pressed={styling}
              onClick={toggleStyling}
            >
              <RiItalic size={21} /> <span className="stylingToggleLabel">Toggle Styling</span>
            </button>
          )}
        </div>
        {/* Phone only (see write.css): the rail holds the beats, and the rail is a drawer at this
            width. This keeps them one tap away without a second drawer. */}
        <details className="phoneBeats">
          <summary>Beats</summary>
          <StoryBeats />
        </details>
        {tab === 'Story' ? (
          <JumpToPlot.Provider value={onJumpToPlot}>
            <ProgressRail />
            <StoryDocument />
          </JumpToPlot.Provider>
        ) : (
          <PlotLayout onWriteBeat={onWriteBeat} onJumpToStory={onJumpToStory} focusBeat={focusBeat} />
        )}
      </div>
      {error && (
        <div className="writeToast" role="alert">
          {error}
          <button type="button" onClick={dismissError} title="Dismiss">
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
