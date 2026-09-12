import { useState } from 'react'
import type { JSX } from 'react'
import { RiCloseLine, RiPencilLine } from '@remixicon/react'
import { useMultiplayer } from '../../core/stores/multiplayerStore'
import { activeSession } from '../../core/multiplayer/hostSession'
import { guestLeave, guestChangePersona } from '../join/JoinView'
import PersonaEditor from './PersonaEditor'
import { useDragReorder } from '../../app/useDragReorder'
import '../../app/dragReorder.css'
import { Avatar } from '../../app/Avatar'
import Lobby from './Lobby'

/**
 * Everyone in the room, in speaking order. Guests see the same list and the same turn holder;
 * only the host can move, remove or skip anybody, and only the host sees the lobby and the
 * Narrator prompt.
 */
export default function MultiplayerPanel({ isHost }: { isHost: boolean }): JSX.Element {
  const participants = useMultiplayer((s) => s.participants)
  const order = useMultiplayer((s) => s.order)
  const turnIndex = useMultiplayer((s) => s.turnIndex)
  const lobby = useMultiplayer((s) => s.lobby)
  const personaLock = useMultiplayer((s) => s.personaLock)
  const meId = useMultiplayer((s) => s.meId)
  const session = activeSession()
  /** Which participant's persona is open in the editor. The host may open anyone's; a guest only
   *  ever opens its own. */
  const [editingId, setEditingId] = useState<string | null>(null)

  const holderId = order[turnIndex]
  const me = participants.find((p) => p.id === meId)
  const editing = participants.find((p) => p.id === editingId)

  // The order is over people, not characters. The host can move anyone, including themself.
  const { itemProps, over } = useDragReorder((from, to) => session?.reorder(from, to), false)

  return (
    <div className="multiplayerPanelContent">
      <section className="panelSection">
        <h4>Turn order</h4>
        <ul className="turnOrderList">
          {order.map((id, i) => {
            const person = participants.find((p) => p.id === id)
            if (!person) return null
            return (
              <li
                key={id}
                className={`turnOrderRow${isHost ? '' : ' fixed'}${id === holderId ? ' holding' : ''}${isHost && over === i ? ' dropTarget' : ''}`}
                {...(isHost ? itemProps(i) : {})}
              >
                <Avatar of={person.avatar ? { avatar: person.avatar } : undefined} name={person.name} />
                <span className="turnOrderName">{person.name}</span>
                {isHost && (
                  <button
                    type="button"
                    className="turnOrderEdit"
                    title="Edit persona"
                    onClick={() => setEditingId(editingId === id ? null : id)}
                  >
                    <RiPencilLine size={14} />
                  </button>
                )}
                {isHost && !person.isHost && (
                  <button
                    type="button"
                    className="turnOrderKick"
                    title="Kick"
                    onClick={() => session?.kick(id)}
                  >
                    <RiCloseLine size={14} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        <div className="sessionControls">
          {isHost && (
            <button type="button" onClick={() => session?.skipTurn()}>
              Skip turn
            </button>
          )}
          <span className="turnModeLabel">Sequential</span>
        </div>
      </section>

      {/* Session-scoped: the host writes the participant in this room. A stored persona row is not
          touched, and neither is the guest's own copy of it. */}
      {isHost && editing && (
        <section className="panelSection">
          <h4>{editing.name}&apos;s persona</h4>
          <PersonaEditor
            key={editing.id}
            persona={{ name: editing.name, description: editing.description, avatar: editing.avatar }}
            onSave={(draft) => {
              session?.setPersona(editing.id, { guestId: editing.id, ...draft })
              setEditingId(null)
            }}
            onCancel={() => setEditingId(null)}
          />
          {editing.isHost && (
            <>
              <p className="panelHint">This persona lasts until the session ends.</p>
              <button
                type="button"
                onClick={() => {
                  session?.clearHostPersona()
                  setEditingId(null)
                }}
              >
                Use my saved persona
              </button>
            </>
          )}
        </section>
      )}

      {isHost && (
        <section className="panelSection">
          <h4>Guest personas</h4>
          <label className="panelCheck">
            <input
              type="checkbox"
              checked={personaLock}
              onChange={(e) => session?.setPersonaLock(e.target.checked)}
            />
            Locked
          </label>
          <p className="panelHint">
            {personaLock
              ? 'Guests cannot edit their own persona.'
              : 'A guest edit takes effect on their next turn.'}
          </p>
        </section>
      )}

      {!isHost && me && (
        <section className="panelSection">
          <h4>Your persona</h4>
          {personaLock ? (
            <p className="panelHint">The host locked persona editing.</p>
          ) : editingId === me.id ? (
            <PersonaEditor
              persona={{ name: me.name, description: me.description, avatar: me.avatar }}
              onSave={(draft) => {
                guestChangePersona(draft)
                setEditingId(null)
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <>
              <button type="button" className="personaEditOpen" onClick={() => setEditingId(me.id)}>
                Edit persona
              </button>
              <p className="panelHint">The change takes effect on your next turn.</p>
            </>
          )}
        </section>
      )}

      {isHost && (
        <section className="panelSection">
          <h4>Waiting to join</h4>
          <Lobby
            pending={lobby}
            onAdmit={(guestId) => session?.admit(guestId)}
            onDeny={(guestId) => session?.deny(guestId)}
          />
        </section>
      )}

      <section className="panelSection">
        {isHost ? (
          <button
            type="button"
            className="endSessionButton"
            onClick={() => {
              if (confirm('End the session for everyone? This cannot be undone.')) {
                session?.close()
              }
            }}
          >
            End session
          </button>
        ) : (
          <button type="button" className="endSessionButton" onClick={guestLeave}>
            Leave session
          </button>
        )}
      </section>
    </div>
  )
}
