import { Fragment, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RiMoreLine } from '@remixicon/react'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import { useChats } from '../../core/stores/chatStore'
import { useWorldInfo } from '../../core/stores/worldInfoStore'
import { useLorebooks } from '../../core/stores/lorebooksStore'
import { Avatar } from '../../app/Avatar'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import CharacterEditor from '../characters/CharacterEditor'
import { exportCardJson, exportCardPng } from '../characters/exportCard'
import ChatList from './ChatList'
import type { Lorebook } from '../../core/storage/types'

/**
 * One character, read and edited on the same page, `/chat/c/:characterId`, or `/chat/c/new`.
 *
 * The description used to be kept off the read view: it's the model's view of the character
 * rather than the reader's. That split cost more than it bought. The card system (variants,
 * greetings, the lorebook, param overrides) had no surface anywhere. The sheet now shows the card
 * whole. Identity, the chat actions and the chat list sit above the collapsed sections: most
 * visits here are to resume a chat.
 */
export default function CharacterSheet() {
  const { characterId } = useParams()
  const navigate = useNavigate()
  const { characters, load, remove } = useCharacters()
  const { chats, loadChats, createChat } = useChats()
  const id = characterId ? Number(characterId) : null
  const character = characters.find((c) => c.id === id) ?? null

  const [menuOpen, setMenuOpen] = useState(false)
  const [exportError, setExportError] = useState('')
  const [saveState, setSaveState] = useState('')
  const menuRef = useCloseOnOutside<HTMLSpanElement>(menuOpen, () => setMenuOpen(false))
  const { books, counts, load: loadBooks } = useLorebooks()

  useEffect(() => {
    if (characters.length === 0) load()
  }, [characters.length, load])

  // Only the export menu needs the books. They load when it opens rather than on every visit.
  useEffect(() => {
    if (menuOpen) loadBooks()
  }, [menuOpen, loadBooks])

  useEffect(() => {
    if (id) loadChats(id)
  }, [id, loadChats])

  // Still loading an existing character. `/chat/c/new` has no id and drops straight through.
  if (id !== null && !character) return <p className="placeholder">Loading…</p>

  // A card carries one `character_book`. A character holding several gets one export item per
  // book rather than a choice made for them. Entries are read at export time. The menu only
  // needs the count: the store already has it.
  const attached = (character?.lorebookIds ?? [])
    .map((bookId) => books.find((b) => b.id === bookId))
    .filter((b) => !!b)

  const runExport = async (format: 'png' | 'json', book?: Lorebook) => {
    setMenuOpen(false)
    try {
      const entries = book ? await useWorldInfo.getState().fetchFor(book.id!) : []
      if (format === 'png') await exportCardPng(character!, entries, book)
      else exportCardJson(character!, entries, book)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed.')
    }
  }

  // The list is sorted by createdAt; "last" here means last written to.
  const lastChat = chats.reduce(
    (best, c) => (best && best.updatedAt >= c.updatedAt ? best : c),
    chats[0],
  )

  const tags = character?.tags ?? []

  // Everything above the sections: who this is, and the two things you came here to do.
  const identity = character && (
    <div className="sheetTop">
      <div className="profileIdentity">
        <Avatar of={character} name={character.name} className="avatar profileAvatar" />
        <div>
          <h3>{displayName(character) || 'Unnamed'}</h3>
          {tags.length > 0 && (
            <div className="profileTags">
              {tags.map((t) => (
                <span key={t} className="tagChip">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="profileActions">
        {lastChat && (
          <button type="button" onClick={() => navigate(`/chat/${lastChat.id}`)}>
            Continue last chat
          </button>
        )}
        <button
          type="button"
          onClick={async () => navigate(`/chat/${await createChat(character.id!)}`)}
        >
          New chat
        </button>
      </div>

      <ChatList character={character} />
    </div>
  )

  return (
    <div className="characterSheet screenFrame">
      <div className="chatPickerHeader">
        <button type="button" className="secondary" onClick={() => navigate('/chat')}>
          Back
        </button>
        <span className="saveState">{saveState}</span>
        {character && (
          <span className="profileMenu" ref={menuRef}>
            <button
              type="button"
              aria-label="More"
              title="More"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <RiMoreLine size={16} />
            </button>
            {menuOpen && (
              <span className="exportMenuList">
                <button
                  type="button"
                  disabled={!character.avatar}
                  onClick={() => runExport('png')}
                >
                  Export PNG
                </button>
                <button type="button" onClick={() => runExport('json')}>
                  Export JSON
                </button>
                {attached.length > 0 && <hr />}
                {attached.map((book) => (
                  <Fragment key={book.id}>
                    <button
                      type="button"
                      disabled={!character.avatar}
                      onClick={() => runExport('png', book)}
                    >
                      Export PNG with {book.name || 'Untitled'} ({counts[book.id!] ?? 0})
                    </button>
                    <button type="button" onClick={() => runExport('json', book)}>
                      Export JSON with {book.name || 'Untitled'} ({counts[book.id!] ?? 0})
                    </button>
                  </Fragment>
                ))}
                <hr />
                <button
                  type="button"
                  className="danger"
                  onClick={async () => {
                    setMenuOpen(false)
                    if (
                      confirm(
                        `Delete ${character.name || 'this character'}, your chats, and your messages?`,
                      )
                    ) {
                      await remove(character.id!)
                      navigate('/chat')
                    }
                  }}
                >
                  Delete
                </button>
              </span>
            )}
          </span>
        )}
      </div>

      {exportError && <p className="hint">{exportError}</p>}

      <CharacterEditor
        key={character?.id ?? 'new'}
        characterId={character?.id ?? null}
        onSaveState={setSaveState}
        header={identity}
        // A new character gets an id on its first autosave. Move onto its own URL: the identity
        // block and chat list appear, and Back has somewhere to return from.
        onCreated={(newId) => navigate(`/chat/c/${newId}`, { replace: true })}
      />
    </div>
  )
}
