import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  RiCloseLine,
  RiPushpin2Fill,
  RiPushpinLine,
  RiSettings3Line,
  RiSparkling2Line,
  RiStopCircleLine,
} from '@remixicon/react'
import { Avatar } from '../../app/Avatar'
import ColorStack from '../../app/ColorStack'
import EntityPicker, { type PickerItem } from '../../app/EntityPicker'
import type { CastEntry } from '../../core/storage/types'
import { chapterState } from '../../core/prompt/chapterGuide'
import { attachBook, removeBook, storyBooks, toggleBook } from '../../core/prompt/storyBooks'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import { useLorebooks } from '../../core/stores/lorebooksStore'
import { usePersonas } from '../../core/stores/personasStore'
import { lockedHint, usePaletteEditor } from '../../core/stores/palettesStore'
import { useSettings, type MarkerKind } from '../../core/stores/settingsStore'
import { useStacks } from '../../core/stores/stacksStore'
import { useWrite } from '../../core/stores/writeStore'
import AppearancePanel from '../appearance/AppearancePanel'
import ParamEditor from '../characters/ParamEditor'
import PromptToggles from '../prompts/PromptToggles'
import { railOrder, togglePin } from './railOrder'
import StoryPromptPanel from './StoryPromptPanel'

// Attach any character/persona; each attached entry has an on/off toggle. Only enabled cast is sent.
function CastSection() {
  const story = useWrite((s) => s.story)
  const setCast = useWrite((s) => s.setCast)
  const characters = useCharacters((s) => s.characters)
  const personas = usePersonas((s) => s.personas)
  const [picking, setPicking] = useState(false)
  if (!story) return null
  const cast = story.cast

  const isAttached = (kind: CastEntry['kind'], id: number) =>
    cast.some((e) => e.kind === kind && e.id === id)

  const attach = (kind: CastEntry['kind'], id: number) =>
    setCast([...cast, { kind, id, enabled: true }])
  const detach = (kind: CastEntry['kind'], id: number) =>
    setCast(cast.filter((e) => !(e.kind === kind && e.id === id)))
  const toggle = (kind: CastEntry['kind'], id: number) =>
    setCast(cast.map((e) => (e.kind === kind && e.id === id ? { ...e, enabled: !e.enabled } : e)))

  // Cast rows show the same avatar + name as the picker. Look both up in one pass.
  const lookOf = (entry: CastEntry) => {
    if (entry.kind === 'character') {
      const c = characters.find((x) => x.id === entry.id)
      return { name: c ? displayName(c) : '(deleted character)', source: c, page: c ? `/chat/c/${c.id}` : null }
    }
    const p = personas.find((x) => x.id === entry.id)
    return { name: p ? p.name : '(deleted persona)', source: p, page: p ? '/personas' : null }
  }

  // `key` carries the kind and id back out of the picker, which only knows about strings.
  const unattached: PickerItem[] = [
    ...characters
      .filter((c) => !isAttached('character', c.id!))
      .map((c) => ({ key: `character-${c.id}`, kind: 'character', label: displayName(c), avatar: c.avatar, avatarCrop: c.avatarCrop })),
    ...personas
      .filter((p) => !isAttached('persona', p.id!))
      .map((p) => ({ key: `persona-${p.id}`, kind: 'persona', label: p.name, avatar: p.avatar, avatarCrop: p.avatarCrop })),
  ]

  return (
    <div className="castSection">
      {cast.length === 0 && <p className="placeholder">No cast attached.</p>}
      <ul className="castList">
        {cast.map((entry) => {
          const look = lookOf(entry)
          return (
            <li key={`${entry.kind}-${entry.id}`}>
              <button
                type="button"
                className="castRow"
                aria-pressed={entry.enabled}
                onClick={() => toggle(entry.kind, entry.id)}
              >
                <Avatar of={look.source} name={look.name || '?'} />
                <span className="entityPickerName">{look.name}</span>
              </button>
              {look.page && (
                <Link to={look.page} className="castRowAction" title={`Open ${entry.kind}`}>
                  <RiSettings3Line size={21} />
                </Link>
              )}
              <button
                type="button"
                className="castRowAction"
                title="Remove from cast"
                onClick={() => detach(entry.kind, entry.id)}
              >
                <RiCloseLine size={21} />
              </button>
            </li>
          )
        })}
      </ul>
      {unattached.length > 0 &&
        (picking ? (
          <EntityPicker
            items={unattached}
            placeholder="Search characters..."
            onCancel={() => setPicking(false)}
            onPick={(item) => {
              const [kind, id] = item.key.split('-')
              attach(kind as CastEntry['kind'], Number(id))
              setPicking(false)
            }}
          />
        ) : (
          <button type="button" className="castAddSlot" onClick={() => setPicking(true)}>
            Add Character +
          </button>
        ))}
    </div>
  )
}

/**
 * The Story's lorebooks: every global book, the books the enabled cast carries, and any standalone
 * book attached here. A row toggles off (greyed, entries stop being sent) or comes off the list
 * entirely. Removing a cast character's book leaves the character in the Story; it only stops that
 * book reaching the prompt, and it stays gone while the character is in the cast.
 *
 * Per Story, all three fields: which books a work draws on is a property of the work.
 */
function BooksSection() {
  const story = useWrite((s) => s.story)
  const setStoryFields = useWrite((s) => s.setStoryFields)
  const characters = useCharacters((s) => s.characters)
  const { books, counts, load } = useLorebooks()
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    load()
  }, [load])

  if (!story) return null

  const rows = storyBooks(story, characters, books)
  const listed = new Set(rows.map((r) => r.book.id))
  const unlisted = books.filter((b) => !listed.has(b.id))

  return (
    <div className="storyBooks">
      {rows.length === 0 && <p className="placeholder">No lorebooks.</p>}
      <ul className="castList">
        {rows.map((row) => (
          <li key={row.book.id}>
            <button
              type="button"
              className="castRow storyBookRow"
              aria-pressed={row.enabled}
              title={row.enabled ? 'Switch off for this Story' : 'Switch on'}
              onClick={() => setStoryFields(toggleBook(story, row.book.id!))}
            >
              <span className="entityPickerName">{row.book.name || 'Unnamed'}</span>
              <span className="lorebooksCount">{counts[row.book.id!] ?? 0}</span>
              {row.origin === 'cast' && <span className="lorebooksBadge">{row.from}</span>}
              {row.origin === 'global' && <span className="lorebooksBadge">All chats</span>}
            </button>
            <Link
              to={`/lorebooks#book-${row.book.id}`}
              className="castRowAction"
              title="Open in Lorebooks"
            >
              <RiSettings3Line size={21} />
            </Link>
            <button
              type="button"
              className="castRowAction"
              title="Remove from this Story"
              onClick={() => setStoryFields(removeBook(story, row))}
            >
              <RiCloseLine size={21} />
            </button>
          </li>
        ))}
      </ul>
      {unlisted.length > 0 &&
        (picking ? (
          <EntityPicker
            items={unlisted.map((b) => ({ key: String(b.id), label: b.name || 'Unnamed' }))}
            placeholder="Search lorebooks..."
            emptyText="No lorebooks."
            onCancel={() => setPicking(false)}
            onPick={(item) => {
              setStoryFields(attachBook(story, Number(item.key)))
              setPicking(false)
            }}
          />
        ) : (
          <button type="button" className="castAddSlot" onClick={() => setPicking(true)}>
            Add Lorebook +
          </button>
        ))}
    </div>
  )
}

/**
 * The whole Story's beats, one `<details>` per Chapter. The active Chapter opens; the rest stay
 * closed. The open/closed state is view-only. Nothing is persisted for it.
 *
 * Every row can be written, not just the active Chapter's, a beat two Chapters out is reachable
 * without moving the cursor there first. Ticking a beat here is the same write the box in the
 * document makes: one `blocks` patch, one meaning.
 *
 * Exported because the phone layout mounts it under the storyBar as well as in the rail.
 */
export function StoryBeats() {
  const chapters = useWrite((s) => s.chapters)
  const activeChapterId = useWrite((s) => s.activeChapterId)
  const story = useWrite((s) => s.story)
  const streaming = useWrite((s) => s.streaming)
  const streamingStoryId = useWrite((s) => s.streamingStoryId)
  const streamingBlockId = useWrite((s) => s.streamingBlockId)
  const writeBlock = useWrite((s) => s.writeBlock)
  const stop = useWrite((s) => s.stop)

  // Folding a Chapter row here is navigation, not a document edit: the rail keeps its own open set
  // and the beats in the document keep theirs. Only the Collapse/Open all button crosses over.
  const setCollapsedBeats = useWrite((s) => s.setCollapsedBeats)
  const [mode, setMode] = useState(0)
  const [shutChapters, setShutChapters] = useState<string[]>([])

  // Streaming only gates rows while it is THIS Story being written.
  const busy = streaming && streamingStoryId === (story?.id ?? null)

  // Scrolling to the Block and focusing it is one action: the list is a way around the document,
  // not a second place to read it.
  function jump(blockId: string) {
    const el = document.querySelector<HTMLElement>(`.storyProse[data-block="${blockId}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center' })
    el.focus()
  }

  if (chapters.length === 0) return <p className="placeholder">No chapters yet.</p>

  const modes = ['Collapse all', 'Open all']
  const allBeats = chapters.flatMap((c) => c.blocks)
  function cycle() {
    if (mode === 0) setCollapsedBeats(allBeats.map((b) => b.id))
    else setCollapsedBeats([])
    setMode((mode + 1) % modes.length)
  }

  function setChapterOpen(chapterId: string, open: boolean) {
    setShutChapters((shut) =>
      open ? shut.filter((c) => c !== chapterId) : [...new Set([...shut, chapterId])],
    )
  }

  return (
    <div className="beatSpine">
      <button type="button" className="storyRailTier" onClick={cycle}>
        {modes[mode]}
      </button>
      {chapters.map((chapter, ci) => {
        const beats = chapter.blocks
        const state = chapterState(chapter, activeChapterId)
        return (
          <details
            key={chapter.id}
            open={
              shutChapters.includes(String(chapter.id))
                ? false
                : beats.length > 0 || chapter.id === activeChapterId
            }
            // currentTarget is already detached by the time this fires; read the element itself.
            // React 19 bubbles onToggle. Without stopping it the enclosing RailSection reads
            // this chapter's open state as its own and folds the whole panel.
            onToggle={(e) => {
              e.stopPropagation()
              setChapterOpen(String(chapter.id), (e.target as HTMLDetailsElement).open)
            }}
          >
            <summary className={`beatChapter ${state}`}>
              {chapter.title.trim() || `Chapter ${ci + 1}`}
            </summary>
            {beats.length === 0 ? (
              <p className="placeholder">No beats yet.</p>
            ) : (
              <ul className="beatChecklist">
                {beats.map((beat, i) => (
                  <li key={beat.id}>
                    <button
                      type="button"
                      className="beatChecklistRow"
                      title="Go to this beat"
                      onClick={() => jump(beat.id)}
                    >
                      {beat.beat.trim() || `Beat ${i + 1}`}
                    </button>
                    {busy && streamingBlockId === beat.id ? (
                      <button type="button" className="castRowAction" title="Stop" onClick={stop}>
                        <RiStopCircleLine size={19} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="castRowAction"
                        title="Write this beat"
                        disabled={busy}
                        onClick={() => {
                          jump(beat.id)
                          writeBlock(chapter.id!, beat.id)
                        }}
                      >
                        <RiSparkling2Line size={19} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </details>
        )
      })}
    </div>
  )
}

// The Story's standing instruction: read on every generation, never cleared. Debounced so a
// keystroke isn't a database write.
function DirectionSection() {
  const story = useWrite((s) => s.story)
  const streaming = useWrite((s) => s.streaming)
  const setDirection = useWrite((s) => s.setDirection)
  const [draft, setDraft] = useState(story?.direction ?? '')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    setDraft(story?.direction ?? '')
  }, [story?.id, story?.direction])

  // Same flush-on-unmount rule as the editor: the pending keystrokes are still the Author's.
  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current)
    },
    [],
  )

  function onChange(text: string) {
    setDraft(text)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      setDirection(text)
    }, 500)
  }

  return (
    <>
      <textarea
        className="directionInput"
        rows={4}
        value={draft}
        disabled={streaming}
        placeholder="A standing instruction for this Story."
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setDirection(draft)}
      />
      <p className="hint">Sent with every generation. It is not cleared after one.</p>
    </>
  )
}

// The Story color field each marker kind edits, the Write-mode twin of AppearancePanel's table.
const storyColorField: Record<MarkerKind, 'storyEmphasisColor' | 'storyBoldColor' | 'storyQuoteColor'> = {
  emphasis: 'storyEmphasisColor',
  bold: 'storyBoldColor',
  quotes: 'storyQuoteColor',
}

// The active connection, shown here to save a trip to Settings when switching endpoints.
// One dropdown, sitting at the top of the rail rather than inside a collapsible of its own,
// matching the chat settings panel.
function ConnectionPick() {
  const connections = useSettings((s) => s.connections)
  const activeConnectionId = useSettings((s) => s.activeConnectionId)
  const setActiveConnection = useSettings((s) => s.setActiveConnection)

  return (
    <label className="storyRailPick railTopPick">
      Connection
      <select
        value={activeConnectionId ?? ''}
        onChange={(e) => setActiveConnection(e.target.value || null)}
      >
        {connections.length === 0 && <option value="">No connections</option>}
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function PromptStackSection() {
  const activeStoryStackId = useSettings((s) => s.activeStoryStackId)
  const stacks = useStacks((s) => s.stacks)
  const saveStack = useStacks((s) => s.save)
  const loadStacks = useStacks((s) => s.load)

  useEffect(() => {
    loadStacks()
  }, [loadStacks])

  const storyStacks = stacks.filter((s) => (s.kind ?? 'chat') === 'story')
  const stack = storyStacks.find((s) => s.id === activeStoryStackId)

  return (
    <>
      <label className="storyRailPick">
        <select
          value={activeStoryStackId ?? ''}
          onChange={(e) => useSettings.setState({ activeStoryStackId: Number(e.target.value) })}
        >
          {storyStacks.length === 0 && <option value="">Default (created on first use)</option>}
          {storyStacks.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {stack && <PromptToggles stack={stack} onChange={saveStack} />}
      <Link to="/prompts?kind=story" className="editStackLink">
        Edit on the Prompts tab
      </Link>
    </>
  )
}

// Per Story, not per Chapter and not global: sampling is a property of the work being written.
// The cast is deliberately not a layer, see Story.paramOverrides.
function ParametersSection() {
  const connections = useSettings((s) => s.connections)
  const activeConnectionId = useSettings((s) => s.activeConnectionId)
  const story = useWrite((s) => s.story)
  const setParamOverrides = useWrite((s) => s.setParamOverrides)
  const connection = connections.find((c) => c.id === activeConnectionId)

  if (!connection)
    return <p className="hint">Pick an active connection in Settings to set parameters.</p>

  return (
    <>
      <p className="hint">Used for this Story only. An empty field uses the connection's value.</p>
      <ParamEditor
        overrides={story?.paramOverrides ?? {}}
        connection={connection}
        scopeLabel="story"
        onChange={(paramOverrides) => setParamOverrides(paramOverrides)}
      />
    </>
  )
}

function AppearanceSection() {
  const showReasoning = useSettings((s) => s.appearance.showReasoning)
  const { palette, locked, patch } = usePaletteEditor()
  const story = useWrite((s) => s.story)
  const setStoryWidth = useWrite((s) => s.setStoryWidth)

  return (
    <>
      {/* Per Story, like the chat's width is per chat. The rail is only here while a Story is
          open. The scope is the Story on screen. The palette's Story width is the default
          every Story that has none of its own uses. */}
      <label className="storyWidth">
        <span>Story width</span>
        <input
          type="range"
          min={20}
          max={100}
          value={story?.storyWidth ?? palette.storyWidth}
          onChange={(e) => setStoryWidth(Number(e.target.value))}
        />
        <input
          type="number"
          min={1}
          max={100}
          step={1}
          value={story?.storyWidth ?? palette.storyWidth}
          onChange={(e) => setStoryWidth(Number(e.target.value))}
        />
        %
      </label>
      <p className="hint">Overrides the Story width in the palette.</p>
      {/* The same global switch as the chat's, shown here to stay reachable without opening a
          chat. There is no per-beat toggle. */}
      <label
        className="checkboxRow"
        title="Hides the reasoning block on beats. Visual only - the reasoning is still stored."
      >
        <input
          type="checkbox"
          checked={showReasoning}
          onChange={(e) => useSettings.getState().setAppearance({ showReasoning: e.target.checked })}
        />
        Show reasoning
      </label>
      {/* Font and size only: the chat's colors don't reach a Story. Showing them here would be
          a control that does nothing. */}
      <AppearancePanel colors={false} font={false} />
      {/* Write-only. These sit here rather than in AppearancePanel, which the chat rail shows
          too. Global like the chat's colors, applied to every Story, and independent of them. */}
      <h3>Story colors</h3>
      {locked && <p className="hint">{lockedHint}</p>}
      <ColorStack
        order={palette.storyColorOrder}
        colorOf={(kind) => palette[storyColorField[kind]]}
        textColor={palette.storyTextColor}
        onOrder={(storyColorOrder) => patch({ storyColorOrder })}
        onColor={(kind, color) => patch({ [storyColorField[kind]]: color })}
        onTextColor={(storyTextColor) => patch({ storyTextColor })}
      />
      <p className="hint">
        Colors Story text in double quotes, asterisks and underscores. Where they overlap, the top
        row wins.
      </p>
    </>
  )
}

// Every section of the rail, in the order they sit in when nothing is pinned.
const railSections: { id: string; label: string; body: () => ReactNode }[] = [
  { id: 'beats', label: 'Beats', body: () => <StoryBeats /> },
  { id: 'direction', label: 'Direction', body: () => <DirectionSection /> },
  { id: 'characters', label: 'Characters', body: () => <CastSection /> },
  { id: 'lorebooks', label: 'Lorebooks', body: () => <BooksSection /> },
  { id: 'promptStack', label: 'Prompt Stack', body: () => <PromptStackSection /> },
  { id: 'parameters', label: 'Parameters', body: () => <ParametersSection /> },
  { id: 'appearance', label: 'Appearance', body: () => <AppearanceSection /> },
  { id: 'promptPreview', label: 'Prompt preview', body: () => <StoryPromptPanel /> },
]

// One section. The pin sits inside the <summary> so it lines up with the label, which means it has
// to stop its own click from reaching the <details> and folding the section. It is a <span> with a
// button role rather than a <button>: a <button> inside a <summary> is invalid HTML.
function RailSection({
  label,
  open,
  pinned,
  onOpen,
  onPin,
  children,
}: {
  label: string
  open: boolean
  pinned: boolean
  onOpen: (open: boolean) => void
  onPin: () => void
  children: ReactNode
}) {
  return (
    <details
      className="railSection"
      open={open}
      // currentTarget is already detached by the time this fires; read the element itself.
      // React 19 bubbles onToggle, so ignore toggles from any nested <details>.
      onToggle={(e) => {
        const el = e.target as HTMLDetailsElement
        if (!el.classList.contains('railSection')) return
        onOpen(el.open)
      }}
    >
      <summary>
        <span className="railSectionLabel">{label}</span>
        <span
          className={pinned ? 'railPin on' : 'railPin'}
          role="button"
          tabIndex={0}
          aria-pressed={pinned}
          title={pinned ? 'Unpin from the top' : 'Pin to the top'}
          onClick={(e) => {
            e.preventDefault()
            onPin()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onPin()
            }
          }}
        >
          {pinned ? <RiPushpin2Fill size={16} /> : <RiPushpinLine size={16} />}
        </span>
      </summary>
      {children}
    </details>
  )
}

/**
 * The open Story's one rail, in the app nav rail where the chat's settings panel goes. Every
 * section is a sibling. The prompt toggles and the beat list can be open at the same time;
 * pinning moves a section to the top of the list.
 *
 * Pin and open state are global rather than per Story, how the rail is arranged is a working
 * habit, not a property of a Story. Per Story is the upgrade path.
 */
export default function StoryRail() {
  const pinned = useSettings((s) => s.storyRailPinned)
  const openIds = useSettings((s) => s.storyRailOpen)
  const setPinned = useSettings((s) => s.setStoryRailPinned)
  const setOpen = useSettings((s) => s.setStoryRailOpen)

  const order = railOrder(
    railSections.map((s) => s.id),
    pinned,
  )

  return (
    <section className="panel storyRail screenBody">
      <ConnectionPick />
      {order.map((id) => {
        const section = railSections.find((s) => s.id === id)!
        return (
          <RailSection
            key={id}
            label={section.label}
            open={openIds.includes(id)}
            pinned={pinned.includes(id)}
            onOpen={(on) =>
              setOpen(on ? [...new Set([...openIds, id])] : openIds.filter((o) => o !== id))
            }
            onPin={() => setPinned(togglePin(pinned, id))}
          >
            {section.body()}
          </RailSection>
        )
      })}
    </section>
  )
}
