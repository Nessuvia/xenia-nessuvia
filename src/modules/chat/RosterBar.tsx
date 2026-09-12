import { RiCloseLine } from '@remixicon/react'
import type { Character, Chat } from '../../core/storage/types'
import { Avatar } from '../../app/Avatar'
import { useDragReorder } from '../../app/useDragReorder'
import '../../app/dragReorder.css'
import { nextSpeakerIndex, participants } from '../../core/stores/roster'
import { displayName } from '../../core/stores/charactersStore'

/**
 * The characters in the room, in speaking order. Click one to hand them the turn; drag to reorder.
 *
 * Removing a character leaves their past messages alone: `speakerName` on each message is a copy.
 * The transcript keeps their name either way.
 */
export default function RosterBar({
  chat,
  characters,
  disabled,
  onSpeak,
  onChange,
}: {
  chat: Chat
  characters: Character[]
  disabled: boolean
  onSpeak: (characterId: number) => void
  /** The new speaking order. `characterId` is repinned to the first entry by the caller. */
  onChange: (participantIds: number[]) => void
}) {
  const ids = participants(chat)
  const upNext = ids[nextSpeakerIndex(chat)]
  const absent = characters.filter((c) => !ids.includes(c.id!))

  // The opener (chat.characterId, always index 0) stays pinned first: block dragging it or
  // dropping anything ahead of it. characterId re-pins to participantIds[0] on every change.
  const { itemProps, over } = useDragReorder((from, to) => {
    const next = [...ids]
    next.splice(to, 0, ...next.splice(from, 1))
    onChange(next)
  }, true)

  return (
    <div className="rosterBar">
      {ids.map((id, i) => {
        const character = characters.find((c) => c.id === id)
        const name = character ? displayName(character) : 'Unknown'
        return (
          <span
            key={id}
            className={`rosterMember${id === upNext ? ' upNext' : ''}${over === i ? ' dropTarget' : ''}`}
            {...itemProps(i)}
          >
            <button
              type="button"
              className="rosterSpeak"
              title={`${name} speaks next`}
              disabled={disabled}
              onClick={() => onSpeak(id)}
            >
              <Avatar of={character} name={name || '?'} />
              <span className="rosterName">{name}</span>
            </button>
            {ids.length > 1 && id !== chat.characterId && (
              <button
                type="button"
                className="rosterRemove"
                title="Remove from chat"
                onClick={() => onChange(ids.filter((x) => x !== id))}
              >
                <RiCloseLine size={14} />
              </button>
            )}
          </span>
        )
      })}

      {absent.length > 0 && (
        <select
          className="rosterAdd"
          aria-label="Add a character"
          value=""
          onChange={(e) => onChange([...ids, Number(e.target.value)])}
        >
          <option value="" disabled>
            Add character
          </option>
          {absent.map((c) => (
            <option key={c.id} value={c.id}>
              {displayName(c) || 'Unnamed'}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
