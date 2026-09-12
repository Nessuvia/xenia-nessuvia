import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useMultiplayer } from '../../core/stores/multiplayerStore'
import type { GuestPersona, MultiplayerEvent } from '../../core/multiplayer/protocol'
import { protocolVersion } from '../../core/multiplayer/protocol'
import { openChannel } from '../../core/multiplayer/channel'
import type { Channel } from '../../core/multiplayer/channel'
import { relayFromLink, relayHost, type RelayConfig } from '../../core/multiplayer/relayConfig'
import SessionView from '../multiplayer/SessionView'
import { RelayNotice } from '../multiplayer/RelayNotice'
import { downscaleImage } from './downscale'
import './join.css'

const nameMax = 100
const descriptionMax = 2000

/** How long to wait for a host's presence before declaring the session gone. */
const hostPresenceTimeoutMs = 5000

/** The guest's own channel. One per tab, opened on submit and closed on decision/end/unmount. */
let channel: Channel | undefined

function closeChannel() {
  channel?.close()
  channel = undefined
}

function handleHostEvent(event: MultiplayerEvent) {
  const store = useMultiplayer.getState()
  switch (event.type) {
    case 'state':
      store.applyState({
        participants: event.participants,
        order: event.order,
        turnIndex: event.turnIndex,
        characters: event.characters,
        narratorName: event.narratorName,
        settings: event.settings,
        appearance: event.appearance,
        messages: event.messages,
        personaLock: event.personaLock,
      })
      break
    case 'append':
      store.appendMessage(event.message)
      break
    case 'stream':
      store.setStreaming({ key: event.key, text: event.text, speakerName: event.speakerName })
      break
    case 'decision':
      if (event.guestId !== store.meId) return
      if (event.admitted) store.setPhase('live')
      else store.setPhase('denied', event.reason ?? '')
      break
    case 'kick':
      if (event.guestId !== store.meId) return
      store.setPhase('ended', 'Removed from the session.')
      closeChannel()
      break
    case 'end':
      store.setPhase('ended', 'The host ended the session.')
      closeChannel()
      break
    // 'hello', 'say' and 'bye' are other guests' broadcasts, visible on the same channel, not this
    // client's business.
  }
}

/** Sends the current guest's `say`. Called from the room, not from `chatStore`, guests never
 *  generate. A no-op when there is no open channel. */
export function guestSay(text: string, responderId: number): void {
  const meId = useMultiplayer.getState().meId
  if (!channel || !meId) return
  channel.send({ v: protocolVersion, type: 'say', guestId: meId, text, responderId })
}

/** Sends a persona rewrite. The host decides whether it is allowed and when it takes effect.
 *  This side only asks. A no-op when there is no open channel. */
export function guestChangePersona(persona: Omit<GuestPersona, 'guestId'>): void {
  const meId = useMultiplayer.getState().meId
  if (!channel || !meId) return
  channel.send({
    v: protocolVersion,
    type: 'persona',
    guestId: meId,
    persona: { guestId: meId, ...persona },
  })
}

/** Leave the room: say `bye`, drop the channel, and clear the store. Ends in `ended`, which is the
 *  phase JoinView renders its own screen for. */
export function guestLeave(): void {
  const store = useMultiplayer.getState()
  if (channel) {
    channel.send({ v: protocolVersion, type: 'bye', guestId: store.meId ?? '' })
    closeChannel()
  }
  store.setPhase('ended', 'You left the session.')
}

function openGuestChannel(sessionId: string, relay: RelayConfig, persona: GuestPersona) {
  const store = useMultiplayer.getState()
  store.begin('guest', sessionId, persona.guestId)
  store.setPhase('connecting')

  try {
    channel = openChannel(relay, sessionId, { id: persona.guestId, isHost: false }, {
      onEvent: handleHostEvent,
      onJoin: () => {},
      onLeave: () => {},
      onReady: (error) => {
        if (error) {
          useMultiplayer.getState().setPhase('ended', error)
          return
        }
        channel?.send({ v: protocolVersion, type: 'hello', persona })
        useMultiplayer.getState().setPhase('waiting')

        // Sessions cannot be enumerated and a used-up link is inert. Presence is the only
        // "does this session exist" check there is.
        setTimeout(() => {
          if (useMultiplayer.getState().phase !== 'waiting') return
          const hostPresent = channel?.members().some((m) => m.isHost) ?? false
          if (!hostPresent) useMultiplayer.getState().setPhase('ended', 'Session not found.')
        }, hostPresenceTimeoutMs)
      },
    })
  } catch (e) {
    useMultiplayer.getState().setPhase('ended', e instanceof Error ? e.message : 'Could not connect.')
  }
}

export default function JoinView(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [params] = useSearchParams()
  // The link says which relay the room is on. Undefined means it said something that is not a
  // usable relay URL, untrusted input, so it is refused rather than handed to a client.
  const relay = relayFromLink(params.get('r'))
  const phase = useMultiplayer((s) => s.phase)
  const reason = useMultiplayer((s) => s.reason)
  const meId = useMultiplayer((s) => s.meId)
  // Not persisted, and not read from localStorage either: a guest's tab writes nothing (see
  // multiplayerStore). The notice comes back next session, which is the accepted trade.
  const [accepted, setAccepted] = useState(false)

  // A guest navigating away must not leave a subscription open.
  useEffect(() => {
    return () => {
      if (channel) {
        channel.send({ v: protocolVersion, type: 'bye', guestId: meId ?? '' })
        closeChannel()
      }
      useMultiplayer.getState().reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The room needs the full viewport, not the form's centered box.
  if (phase === 'live') return <SessionView />

  if (!relay) {
    return (
      <div id="join">
        <p>This link points at a relay that cannot be used.</p>
      </div>
    )
  }

  return (
    <div id="join">
      {phase === 'idle' && !accepted && (
        <RelayNotice host={relayHost(relay)} onAccept={() => setAccepted(true)} />
      )}
      {phase === 'idle' && accepted && (
        <PersonaForm
          sessionId={sessionId ?? ''}
          onSubmit={(persona) => openGuestChannel(sessionId ?? '', relay, persona)}
        />
      )}
      {phase === 'connecting' && <p>Connecting…</p>}
      {phase === 'waiting' && <p>Waiting for the host.</p>}
      {phase === 'denied' && (
        <div>
          <p>Not admitted.</p>
          <p>{reason}</p>
        </div>
      )}
      {phase === 'ended' && <p>{reason || 'Session not found.'}</p>}
    </div>
  )
}

function PersonaForm({
  sessionId,
  onSubmit,
}: {
  sessionId: string
  onSubmit: (persona: GuestPersona) => void
}): JSX.Element {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [avatar, setAvatar] = useState('')
  const [avatarError, setAvatarError] = useState('')

  async function pickAvatar(file: File) {
    setAvatarError('')
    try {
      setAvatar(await downscaleImage(file))
    } catch {
      setAvatarError('Not a decodable image.')
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !sessionId) return
    onSubmit({
      guestId: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      avatar: avatar || undefined,
    })
  }

  return (
    <form className="joinForm" onSubmit={submit}>
      <h2>Join session</h2>
      <label>
        Name
        <input
          value={name}
          maxLength={nameMax}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <label>
        Description (optional)
        <textarea
          rows={4}
          value={description}
          maxLength={descriptionMax}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label>
        Picture (optional)
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void pickAvatar(file)
          }}
        />
      </label>
      {avatar && <img className="joinAvatarPreview" src={avatar} alt="" />}
      {avatarError && <p className="joinError">{avatarError}</p>}
      <button type="submit" disabled={!name.trim()}>
        Join
      </button>
    </form>
  )
}
