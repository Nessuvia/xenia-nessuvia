import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  RiCloseLine,
  RiDraggable,
  RiPushpin2Fill,
  RiPushpinLine,
  RiSettings3Line,
} from '@remixicon/react'
import { Avatar } from '../../app/Avatar'
import ColorStack from '../../app/ColorStack'
import EntityPicker, { type PickerItem } from '../../app/EntityPicker'
import { useDragReorder } from '../../app/useDragReorder'
import RuleSetPicker from '../../app/RuleSetPicker'
import { useStoryRules } from '../../core/stores/textRules'
import type { Beat, CastEntry } from '../../core/storage/types'
import { attachBook, removeBook, storyBooks, toggleBook } from '../../core/prompt/storyBooks'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import { useLorebooks } from '../../core/stores/lorebooksStore'
import { usePersonas } from '../../core/stores/personasStore'
import { lockedHint, usePaletteEditor } from '../../core/stores/palettesStore'
import { useSettings, type MarkerKind } from '../../core/stores/settingsStore'
import { useStacks } from '../../core/stores/stacksStore'
import { useWrite } from '../../core/stores/writeStore'
import AppearancePanel from '../appearance/AppearancePanel'
import PromptToggles from '../prompts/PromptToggles'
import { railOrder, togglePin } from './railOrder'
import StoryPromptPanel from './StoryPromptPanel'
import { chapterHeadings } from './proseMarkup'
import { jumpTo } from './StoryDocument'

// Attach any character/persona; each attached entry has an on/off toggle. Only enabled cast is sent.
function CastSection() {
  const story = useWrite((s) => s.story)
  const update = useWrite((s) => s.update)
  const setCast = (next: CastEntry[]) => update({ cast: next })
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
  const setStoryFields = useWrite((s) => s.update)
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
 * A Story text field that writes on blur rather than per keystroke: each write puts the whole
 * Story, document included. Keyed by Story id by the caller, so opening another one resets it.
 */
function StoryField({ field, rows, placeholder }: { field: 'premise' | 'ending' | 'note'; rows: number; placeholder: string }) {
  const story = useWrite((s) => s.story)
  const update = useWrite((s) => s.update)
  if (!story) return null
  return (
    <textarea
      key={story.id}
      className="storyRailField"
      rows={rows}
      defaultValue={story[field]}
      placeholder={placeholder}
      onBlur={(e) => e.target.value !== story[field] && update({ [field]: e.target.value })}
    />
  )
}

/**
 * Premise, beats, ending. A beat is a to-do for the model: the first one not ticked is the one it
 * writes toward. Ticking is the Author's call. Nothing ticks a beat on its own.
 */
function PlotSection() {
  const story = useWrite((s) => s.story)
  const update = useWrite((s) => s.update)
  const [adding, setAdding] = useState('')
  const beats = story?.beats ?? []
  const drag = useDragReorder((from, to) => {
    const next = [...beats]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    update({ beats: next })
  })
  if (!story) return null

  const setBeat = (id: string, patch: Partial<Beat>) =>
    update({ beats: beats.map((b) => (b.id === id ? { ...b, ...patch } : b)) })
  const current = beats.find((b) => !b.done && b.text.trim())?.id

  return (
    <div className="storyPlot">
      <label className="storyRailLabel">
        Premise
        <StoryField field="premise" rows={3} placeholder="Where the story starts." />
      </label>
      <span className="storyRailLabel">Beats</span>
      {beats.length === 0 && <p className="hint">No beats.</p>}
      <ul className="storyBeatList">
        {/* Handle and row split, not itemProps: the row holds a text field. See useDragReorder. */}
        {beats.map((beat, index) => (
          <li
            key={beat.id}
            className={`storyBeatRow${beat.done ? ' done' : ''}${beat.id === current ? ' current' : ''}${drag.over === index ? ' dropTarget' : ''}`}
            {...drag.dropProps(index)}
          >
            <span className="storyBeatHandle" title="Drag to reorder" aria-label="Drag to reorder" {...drag.handleProps(index)}>
              <RiDraggable size={16} />
            </span>
            <input
              type="checkbox"
              checked={beat.done}
              title="Done"
              aria-label="Done"
              onChange={(e) => setBeat(beat.id, { done: e.target.checked })}
            />
            <input
              className="storyBeatText"
              defaultValue={beat.text}
              onBlur={(e) => e.target.value !== beat.text && setBeat(beat.id, { text: e.target.value })}
            />
            <button
              type="button"
              className="castRowAction"
              title="Remove beat"
              onClick={() => update({ beats: beats.filter((b) => b.id !== beat.id) })}
            >
              <RiCloseLine size={18} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="storyBeatAdd"
        onSubmit={(e) => {
          e.preventDefault()
          if (!adding.trim()) return
          update({ beats: [...beats, { id: crypto.randomUUID(), text: adding.trim(), done: false }] })
          setAdding('')
        }}
      >
        <input
          className="storyBeatAddInput"
          value={adding}
          placeholder="Something that should happen"
          onChange={(e) => setAdding(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>
      <label className="storyRailLabel">
        Ending
        <StoryField field="ending" rows={3} placeholder="Where it's meant to end." />
      </label>
    </div>
  )
}

function NoteSection() {
  return (
    <>
      <StoryField field="note" rows={4} placeholder="A standing instruction for this Story." />
      <p className="hint">Sent with every generation.</p>
    </>
  )
}

/** Which text rule sets this Story uses. Writes `story.ruleSetIds`, this Story only. */
function TextRulesSection() {
  const story = useWrite((s) => s.story)
  const update = useWrite((s) => s.update)
  const { ids } = useStoryRules(story)
  if (!story) return null
  return (
    <RuleSetPicker
      ids={ids}
      onChange={(ruleSetIds) => update({ ruleSetIds })}
      scope="this Story"
      hint="Applies to this Story only. Only a set's Find & Replace rules affect the document."
    />
  )
}

/** The `# ` headings in the document. Clicking one moves the cursor there. */
function ChaptersSection() {
  const text = useWrite((s) => s.story?.text ?? '')
  const headings = chapterHeadings(text)
  if (!headings.length) return <p className="hint">A line starting with "# " is a chapter heading.</p>
  return (
    <ul className="storyChapterList">
      {headings.map((h, i) => (
        <li key={`${h.offset}`}>
          <button type="button" className="storyChapterRow" onClick={() => jumpTo(h.offset)}>
            {i + 1}. {h.title}
          </button>
        </li>
      ))}
    </ul>
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

function AppearanceSection() {
  const { palette, locked, patch } = usePaletteEditor()
  const story = useWrite((s) => s.story)
  const update = useWrite((s) => s.update)
  const setStoryWidth = (width: number) => update({ storyWidth: Math.min(100, Math.max(1, width || 100)) })

  return (
    <>
      {/* Per Story, like the chat's width is per chat. The rail is only here while a Story is
          open. The scope is the Story on screen. The palette's Story width is the default
          every Story that has none of its own uses. */}
      <label className="storyWidth">
        <span>Story width (%)</span>
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
      </label>
      <p className="hint">Overrides the Story width in the palette.</p>
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
  { id: 'plot', label: 'Plot', body: () => <PlotSection /> },
  { id: 'note', label: "Author's Note", body: () => <NoteSection /> },
  { id: 'chapters', label: 'Chapters', body: () => <ChaptersSection /> },
  { id: 'characters', label: 'Characters', body: () => <CastSection /> },
  { id: 'lorebooks', label: 'Lorebooks', body: () => <BooksSection /> },
  { id: 'promptStack', label: 'Prompt Stack', body: () => <PromptStackSection /> },
  { id: 'textRules', label: 'Text rules', body: () => <TextRulesSection /> },
  { id: 'appearance', label: 'Appearance', body: () => <AppearanceSection /> },
  { id: 'promptPreview', label: 'Prompt preview', body: () => <StoryPromptPanel /> },
]

// One section. The pin sits inside the <summary> so it lines up with the label, which means it has
// to stop its own click from reaching the <details> and folding the section. It's a <span> with a
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
