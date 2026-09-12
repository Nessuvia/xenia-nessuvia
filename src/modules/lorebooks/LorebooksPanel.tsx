import { Link } from 'react-router-dom'
import { useChats } from '../../core/stores/chatStore'
import BookAttach from './BookAttach'

/**
 * The chat sidebar's Lorebooks section. Writes `chat.lorebookIds`, this chat only. The speaking
 * character's own books and any book set to all chats apply on top and are not listed here:
 * detaching one from this panel would have to edit a record this panel doesn't own.
 */
export default function LorebooksPanel() {
  const chat = useChats((s) => s.chat)
  const patchChat = useChats((s) => s.patchChat)
  if (!chat) return null

  return (
    <>
      <BookAttach
        ids={chat.lorebookIds ?? []}
        onChange={(lorebookIds) => patchChat({ lorebookIds })}
        emptyText="No lorebooks in this chat."
      />
      <p className="hint">
        This chat only. The character's own books and any book set to all chats also apply. Edit
        them in <Link to="/lorebooks">Lorebooks</Link>.
      </p>
    </>
  )
}
