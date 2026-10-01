import { textRulesFor } from '../../core/stores/textRules'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RiDeleteBinLine, RiDownloadLine, RiPencilLine, RiSearchLine, RiStarFill, RiStarLine } from '@remixicon/react'
import { useChats } from '../../core/stores/chatStore'
import { displayName, useCharacters } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import { useSettings } from '../../core/stores/settingsStore'
import { usePalette } from '../../core/stores/palettesStore'
import type { Character, Chat } from '../../core/storage/types'
import { CollapseButton } from '../../app/CollapseButton'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import {
  buildTranscript,
  exportChatHtml,
  exportChatJson,
  exportChatTxt,
  type Names,
} from './exportChat'

/**
 * The three transcript formats for one chat row. Messages are read per click rather than held in
 * state: the list never loads message bodies, and an export is rare enough that one read on demand
 * is cheaper than keeping every chat's history around.
 */
function ExportMenu({ chat, character }: { chat: Chat; character: Character }) {
  const [open, setOpen] = useState(false)
  const ref = useCloseOnOutside<HTMLDivElement>(open, () => setOpen(false))
  const messagesOf = useChats((s) => s.messagesOf)
  const characters = useCharacters((s) => s.characters)
  const personas = usePersonas((s) => s.personas)
  const activePersonaId = useSettings((s) => s.activePersonaId)
  const palette = usePalette()

  // The same credits ChatView shows, resolved once for the whole transcript.
  const names: Names = {
    speakers: new Map(characters.filter((c) => c.id !== undefined).map((c) => [c.id!, displayName(c)])),
    characterName: displayName(character),
    personaName: personas.find((p) => p.id === activePersonaId)?.name,
  }

  const run = (format: 'json' | 'txt' | 'html') => {
    setOpen(false)
    messagesOf(chat.id!).then((messages) => {
      if (format === 'json') return exportChatJson(chat, messages)
      const transcript = buildTranscript(chat, messages, names, textRulesFor(chat).tagRules)
      if (format === 'txt') exportChatTxt(transcript)
      else exportChatHtml(transcript, palette)
    })
  }

  return (
    <div className="chatExport" ref={ref}>
      <button
        type="button"
        className="chatRowIcon"
        title="Export"
        aria-label="Export"
        onClick={() => setOpen(!open)}
      >
        <RiDownloadLine size={16} />
      </button>
      {open && (
        <div className="chatExportMenu">
          <button type="button" onClick={() => run('json')}>
            JSON
          </button>
          <button type="button" onClick={() => run('txt')}>
            Text
          </button>
          <button type="button" onClick={() => run('html')}>
            HTML
          </button>
        </div>
      )}
    </div>
  )
}

export default function ChatList({
  character,
  onCollapse,
}: {
  character: Character
  onCollapse?: () => void
}) {
  const { chats, loadChats, renameChat, deleteChat, toggleBookmark } = useChats()
  const searchMessages = useChats((s) => s.searchMessages)
  const loadSearchIndex = useChats((s) => s.loadSearchIndex)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [search, setSearch] = useState('')
  // Off by default: a search reads the messages. Not persisted: which way you're searching right
  // now is a glance-level choice, like the collapsed column next door.
  const [titlesOnly, setTitlesOnly] = useState(false)
  // Also not persisted, deliberately: skipping the confirm is a decision for this sitting only.
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false)

  useEffect(() => {
    loadChats(character.id!)
  }, [character.id, loadChats])

  const query = search.trim().toLowerCase()
  const inside = !titlesOnly && query !== ''

  // Loaded once, when the first message search is typed, then every keystroke filters the array.
  // Reading the table per keystroke would be the same answer at a much worse price.
  useEffect(() => {
    if (inside) loadSearchIndex(character.id!)
  }, [inside, character.id, loadSearchIndex])

  // The delete toggle only earns its row once the list is long enough to need it.
  const showTools = chats.length > 4

  /** Matching messages per chat id: a literal, case-insensitive match. Empty for titles only. */
  const counts = useMemo(() => {
    if (!inside) return {} as Record<number, number>
    const out: Record<number, number> = {}
    for (const m of searchMessages) {
      if (m.content.toLowerCase().includes(query)) out[m.chatId] = (out[m.chatId] ?? 0) + 1
    }
    return out
  }, [inside, query, searchMessages])

  // Searching messages, a title hit still counts: the message matches add to it.
  const shown = chats.filter(
    (c) => c.title.toLowerCase().includes(query) || (c.id !== undefined && counts[c.id] > 0),
  )

  return (
    <div className="chatPicker">
      <div className="chatPickerHeader">
        <span className="chatPickerTitle">
          <h2>Chats</h2>
          {chats.length > 0 && <span className="hint">({chats.length})</span>}
          {onCollapse && <CollapseButton label="Chats" collapsed={false} onToggle={onCollapse} />}
        </span>
        <span className="chatSearchRow">
          <RiSearchLine size={16} className="chatSearchGlass" aria-hidden />
          <input
            type="search"
            className="chatSearch"
            placeholder="Search chats..."
            aria-label="Search chats"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="chatSearchInside">
            <input
              type="checkbox"
              checked={titlesOnly}
              onChange={(e) => setTitlesOnly(e.target.checked)}
            />
            Titles only
          </label>
        </span>
      </div>

      {/* The sheet sits this list above the card's sections. Its chrome costs the sections
          screen space, so the delete toggle only appears once the list is long. */}
      {showTools && (
        <>
          <label className="chatDeleteToggle">
            <input
              type="checkbox"
              checked={skipDeleteConfirm}
              onChange={(e) => setSkipDeleteConfirm(e.target.checked)}
            />
            Immediately delete chats when clicking Delete
          </label>
        </>
      )}

      {chats.length === 0 && <p className="placeholder">No chats yet.</p>}
      {chats.length > 0 && shown.length === 0 && <p className="placeholder">No matches.</p>}

      <ul className="pickerList">
        {shown.map((c) => (
          <li key={c.id} className="card chatRow">
            {renaming === c.id ? (
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  // Blur commits, like the chat title in the header. Escape clears the draft
                  // first: the blur it causes has nothing left to write.
                  if (title.trim() && title.trim() !== c.title) renameChat(c.id!, title.trim())
                  setRenaming(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    renameChat(c.id!, title.trim() || c.title)
                    setRenaming(null)
                    setTitle('')
                  }
                  if (e.key === 'Escape') {
                    setTitle('')
                    setRenaming(null)
                  }
                }}
              />
            ) : (
              <Link className="chatTitle" to={`/chat/${c.id}`}>
                {c.title}
              </Link>
            )}
            {c.id !== undefined && counts[c.id] > 0 && (
              <span className="hint chatMatchCount">
                {counts[c.id] === 1 ? '1 match' : `${counts[c.id]} matches`}
              </span>
            )}
            <button
              type="button"
              className="starButton chatRowIcon"
              title={c.bookmarked ? 'Remove bookmark' : 'Bookmark'}
              aria-label={c.bookmarked ? 'Remove bookmark' : 'Bookmark'}
              onClick={() => toggleBookmark(c.id!)}
            >
              {c.bookmarked ? <RiStarFill size={16} /> : <RiStarLine size={16} />}
            </button>
            <ExportMenu chat={c} character={character} />
            <button
              type="button"
              className="chatRowIcon"
              title="Rename"
              aria-label="Rename"
              onClick={() => {
                setTitle(c.title)
                setRenaming(c.id!)
              }}
            >
              <RiPencilLine size={16} />
            </button>
            <button
              type="button"
              className="chatRowIcon danger"
              title="Delete"
              aria-label="Delete"
              onClick={() => {
                if (skipDeleteConfirm || confirm(`Delete "${c.title}" and its messages?`))
                  deleteChat(c.id!)
              }}
            >
              <RiDeleteBinLine size={16} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
