import { useState } from 'react'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import { RiCheckboxBlankCircleLine, RiRobot2Line } from '@remixicon/react'
import type { Character, Chat } from '../../core/storage/types'
import { Avatar } from '../../app/Avatar'
import { participants } from '../../core/stores/roster'
import { displayName } from '../../core/stores/charactersStore'
import { isNarrator, narratorId, narratorName } from '../../core/multiplayer/narrator'
// Reuses the persona switcher's avatar-menu look, same layout, different source.
import '../../app/personaSwitcher.css'

/**
 * Pins one participant as the responder: only they reply to your messages until cleared. An open
 * circle means nobody's pinned (round robin); the pinned character's avatar shows once one is set.
 * Clicking a roster avatar still triggers anyone manually, this only steers the automatic reply.
 */
export default function ResponderPicker({
  chat,
  characters,
  onPick,
  /** Show the Narrator first and make it the default. Multiplayer only. */
  withNarrator,
}: {
  chat: Chat
  characters: Character[]
  /** undefined clears the pin (back to round robin). */
  onPick: (id: number | undefined) => void
  withNarrator?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useCloseOnOutside(open, () => setOpen(false))

  const memberIds = participants(chat)
  // The Narrator is deliberately not in participantIds. The membership check has to allow it.
  const narratorPinned = withNarrator === true && isNarrator(chat.respondWith)
  // Only a current member counts as pinned, a dropped-out responder looks like cleared.
  const isPinnedMember = chat.respondWith !== undefined && memberIds.includes(chat.respondWith)
  const pinned = isPinnedMember ? characters.find((c) => c.id === chat.respondWith) : undefined

  return (
    <div className="personaSwitch" ref={ref}>
      {open && (
        <div className="panel personaSwitchMenu">
          {/* The Narrator comes first and has no avatar of its own. */}
          {withNarrator && !narratorPinned && (
            <button
              type="button"
              className="personaSwitchAvatar responderEmpty"
              title={narratorName}
              onClick={() => {
                onPick(narratorId)
                setOpen(false)
              }}
            >
              <RiRobot2Line size={18} />
            </button>
          )}

          {(pinned || narratorPinned) && (
            <button
              type="button"
              className="personaSwitchAvatar responderEmpty"
              title="Clear, everyone takes turns"
              onClick={() => {
                onPick(undefined)
                setOpen(false)
              }}
            >
              <RiCheckboxBlankCircleLine size={18} />
            </button>
          )}

          {memberIds
            .map((id) => characters.find((c) => c.id === id))
            .filter((c): c is Character => !!c && c.id !== chat.respondWith)
            .map((c) => (
              <Avatar
                key={c.id}
                of={c}
                name={displayName(c)}
                className="personaSwitchAvatar"
                title={displayName(c)}
                onClick={() => {
                  onPick(c.id!)
                  setOpen(false)
                }}
              />
            ))}
        </div>
      )}
      {narratorPinned ? (
        <button
          type="button"
          className="personaSwitchAvatar responderEmpty"
          title={`${narratorName} responds, click to change`}
          onClick={() => setOpen((v) => !v)}
        >
          <RiRobot2Line size={18} />
        </button>
      ) : pinned ? (
        <Avatar
          of={pinned}
          name={displayName(pinned)}
          className="personaSwitchAvatar"
          title={`${displayName(pinned)} responds, click to change`}
          onClick={() => setOpen((v) => !v)}
        />
      ) : (
        <button
          type="button"
          className="personaSwitchAvatar responderEmpty"
          title="Pick who responds"
          onClick={() => setOpen((v) => !v)}
        >
          <RiCheckboxBlankCircleLine size={18} />
        </button>
      )}
    </div>
  )
}
