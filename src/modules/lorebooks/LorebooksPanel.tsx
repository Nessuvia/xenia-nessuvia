import { Link } from 'react-router-dom'
import { rosterBookIds, useChats } from '../../core/stores/chatStore'
import { useCharacters } from '../../core/stores/charactersStore'
import { useLorebooks } from '../../core/stores/lorebooksStore'
import BookAttach from './BookAttach'

/**
 * The chat sidebar's Lorebooks section. Writes `chat.lorebookIds`, this chat only. The roster's
 * own books are listed with a switch that writes `chat.lorebooksOff`, also this chat only: the
 * character record is never edited from here.
 */
export default function LorebooksPanel() {
  const chat = useChats((s) => s.chat)
  const patchChat = useChats((s) => s.patchChat)
  // Subscribed so the list follows card edits; rosterBookIds reads the store itself.
  useCharacters((s) => s.characters)
  const books = useLorebooks((s) => s.books)
  if (!chat) return null

  const off = chat.lorebooksOff ?? []
  const own = rosterBookIds(chat)
    .map((id) => books.find((b) => b.id === id))
    .filter((b) => !!b)

  return (
    <>
      <BookAttach
        ids={chat.lorebookIds ?? []}
        onChange={(lorebookIds) => patchChat({ lorebookIds })}
        emptyText="No lorebooks for this chat."
        canCreate={false}
      >
      {own.length > 0 && (
        <ul className="lorebooksAttachList">
          {own.map((b) => (
            <li key={b.id} className="lorebooksAttachRow">
              <Link className="lorebooksName" to={`/lorebooks#book-${b.id}`} title="Open in Lorebooks">
                {b.name || 'Unnamed'}
              </Link>
              <input
                type="checkbox"
                role="switch"
                className="lorebooksSwitch"
                aria-label={`Use ${b.name || 'this book'} in this chat`}
                checked={!off.includes(b.id!)}
                onChange={(e) =>
                  patchChat({
                    lorebooksOff: e.target.checked ? off.filter((id) => id !== b.id) : [...off, b.id!],
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
      </BookAttach>
      <p className="hint">
        Attached books apply to this chat only. The switches turn a character's own book off for
        this chat. Edit books in <Link to="/lorebooks">Lorebooks</Link>.
      </p>
    </>
  )
}
