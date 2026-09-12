/**
 * The host's authority. Everything the room decides, it decides here: who is admitted, whose turn
 * it is, which character replies, and what guests are told.
 *
 * The host's browser owns the chat: it holds the connection and the key, builds every prompt and
 * streams every reply. `channel.ts` only relays. `chatStore` and the connectors learn nothing about
 * multiplayer. The stream relay below is a subscription from the outside.
 */
import type { Character, Chat, Message } from '../storage/types'
import { openChannel, newSessionId } from './channel'
import type { Channel } from './channel'
import { inviteLink, type RelayConfig } from './relayConfig'
import type {
  GuestEvent,
  GuestPersona,
  HostEvent,
  Participant,
  RosterCharacter,
  SettingsSummary,
  SharedAppearance,
} from './protocol'
import { forGuests, protocolVersion } from './protocol'
// The store's own removeParticipant already applies turnOrder's cursor correction.
import { advance, addParticipant, reorder } from './turnOrder'
import { castBlock, narratorName } from './narrator'
import type { CastMember } from './narrator'
import {
  setSessionPersonas as setChatStorePersonas,
  setSessionCast,
  useChats,
} from '../stores/chatStore'
import { useMultiplayer } from '../stores/multiplayerStore'
import { usePersonas } from '../stores/personasStore'
import { useSettings } from '../stores/settingsStore'
import { activePalette } from '../stores/palettesStore'
import { effectiveFont, resolveBackground } from '../palette/palette'
import { downscaleAvatar } from './rosterAvatar'
import { displayName } from '../stores/charactersStore'

/** The host's participant id. One host per room: it needs no uniqueness beyond the room. */
const hostId = 'host'

/** The roster cap. The Narrator sits outside it and is never in `chat.participantIds`. */
const maxCharacters = 4

/** Untrusted-string caps for a guest persona. */
const maxPersonaName = 100
const maxPersonaDescription = 2000
/** A base64 data URI from a stranger, already downscaled by the sender. */
const maxAvatarBytes = 256 * 1024

/** ~5 stream events a second: a reply costs roughly 50 events per recipient. */
const streamIntervalMs = 200

/** A `state` carries a recent window, not the whole transcript. `append` keeps guests current. */
const stateMessageWindow = 60

export interface HostSession {
  sessionId: string
  /** The full URL to share. */
  link: string
  admit(guestId: string): void
  deny(guestId: string, reason?: string): void
  kick(guestId: string): void
  reorder(from: number, to: number): void
  /** Pass the current turn without a message. */
  skipTurn(): void
  /** Rename the session's chat. Host only; guests read the title in their left panel. */
  setTitle(title: string): Promise<void>
  /** Allow or forbid guests editing their own persona. */
  setPersonaLock(locked: boolean): void
  /**
   * Write a participant's persona from the host's side. Applies at once, whoever holds the turn:
   * the host is the authority and does not queue behind it. Session-scoped: this writes the
   * participant in the room, not the host's stored persona row.
   */
  setPersona(id: string, persona: GuestPersona): void
  /**
   * Drop the host's session-only persona and go back to following their stored one. No-op when the
   * host has not overridden it.
   */
  clearHostPersona(): void
  /** The host's own turn. Mirrors a guest `say`. */
  say(text: string, responderId: number): Promise<void>
  /** Broadcast `end`, unsubscribe, reset the store. */
  close(): void
}

let session: HostSession | undefined

/** The live session, or undefined. One per tab. */
export function activeSession(): HostSession | undefined {
  return session
}

// --- creating ------------------------------------------------------------

/**
 * Open a room. Creates the Chat row, opens the channel, and takes authority.
 * Throws when the user is not signed in or sync is not configured.
 */
/** What the host chose on the start screen. Every field has a default: the object is optional. */
export interface SessionOptions {
  /** True to forbid guests editing their own persona from the outset. */
  personaLock?: boolean
  /** Which relay this session runs over. Defaults to the stored setting. Passed per session rather
   *  than read here: the landing's picker stays a per-session choice. Picking a relay for one
   *  room must not rewrite the global default. */
  relay?: RelayConfig
}

export async function createSession(
  characters: Character[],
  // Stack ids are numeric Dexie keys in this codebase; the design document's `string` is loose.
  stackId: number | undefined,
  options: SessionOptions = {},
): Promise<HostSession> {
  if (session) throw new Error('A session is already open in this tab.')
  if (!characters.length) throw new Error('Pick at least one character.')
  if (characters.length > maxCharacters) {
    throw new Error(`Up to ${maxCharacters} characters.`)
  }

  // The session's chat is an ordinary chat that happens to be driven remotely: a normal Chat row
  // with normal Message rows, staying in the host's library afterwards.
  const chats = useChats.getState()
  const chatId = await chats.createChat(characters[0].id!)
  await chats.load(chatId)
  const participantIds = characters.map((c) => c.id!)
  // Per-chat, all three: the session's stack and its speaker labels belong to this chat and must
  // not touch the global active stack, which every ordinary chat reads.
  await chats.patchChat({
    participantIds,
    characterId: participantIds[0],
    nameSpeakers: true,
    ...(stackId !== undefined ? { stackId } : {}),
  })

  const persona = await usePersonas.getState().ensureActive()
  const sessionId = newSessionId()
  // Same unbounded original the character portraits are. Downscale before it joins the roster.
  const hostAvatar = await downscaleAvatar(persona.avatar)

  // Every await finishes before the store is touched. `phase` leaving 'idle' is what swaps the
  // landing page for the room. Nothing may flip it until there is a roster to draw and a
  // `session` to act on: an await in the middle of the store writes renders the room against an
  // empty store, and a throw or a hang in one leaves that empty room up with the error going
  // nowhere: the Landing that would have shown it is already unmounted.
  const roster = await Promise.all(characters.map(rosterCharacter))

  const store = useMultiplayer.getState()
  store.reset()
  store.begin('host', sessionId, hostId)
  store.setPersonaLock(options.personaLock === true)
  store.applyState({
    participants: [
      {
        id: hostId,
        name: persona.name,
        description: persona.description,
        ...(hostAvatar ? { avatar: hostAvatar } : {}),
        isHost: true,
      },
    ],
    order: [hostId],
    turnIndex: 0,
    characters: roster,
    narratorName,
    settings: settingsSummary(useChats.getState().chat, characters.length),
    appearance: sharedAppearance(),
    messages: [],
    personaLock: options.personaLock === true,
  })

  const relay = options.relay ?? useSettings.getState().relay
  const channel = openChannel(relay, sessionId, { id: hostId, isHost: true }, {
    onEvent: (event) => handleGuestEvent(event as GuestEvent),
    onJoin: () => {
      // Presence alone admits nobody. A guest is in the room once it says `hello` and the host
      // admits it. A fresh `state` is all a new arrival gets.
      broadcastState()
    },
    onLeave: (member) => dropParticipant(member.id),
    onReady: (error) => {
      if (error) {
        useMultiplayer.getState().setPhase('ended', error)
        return
      }
      useMultiplayer.getState().setPhase('live')
      broadcastState()
    },
  })

  live = { channel, chatId, characters: [...characters] }
  // Slot order for {{char1}}…{{char4}} is the order the host picked them in.
  setSessionCast(live.characters)
  stopRelay = startStreamRelay(chatId)
  stopPersonaWatch = watchHostPersona()
  pushSessionPersonas()

  session = {
    sessionId,
    // The link carries the relay: a guest has no other way to learn where the room is.
    link: inviteLink(window.location.origin, sessionId, relay),
    admit,
    deny,
    kick,
    reorder: reorderTurn,
    skipTurn,
    setTitle,
    setPersonaLock,
    setPersona: hostSetPersona,
    clearHostPersona,
    say: (text, responderId) => applySay(hostId, text, responderId),
    close,
  }

  // Last: the room is only shown once the store holds the roster and `activeSession()` answers.
  // The panels never render against a half-built session. Only from 'idle': if the channel came
  // up in the meantime, 'live' is the newer truth and must not be walked back to 'connecting'.
  if (useMultiplayer.getState().phase === 'idle') store.setPhase('connecting')
  return session
}

/** Everything the live session needs that is not in the store. Undefined between sessions. */
let live: { channel: Channel; chatId: number; characters: Character[] } | undefined
let stopRelay: (() => void) | undefined
let stopPersonaWatch: (() => void) | undefined

async function rosterCharacter(character: Character): Promise<RosterCharacter> {
  const avatar = await downscaleAvatar(character.avatar)
  return {
    id: character.id!,
    name: displayName(character),
    ...(avatar ? { avatar } : {}),
  }
}

function settingsSummary(chat: Chat | null, characterCount: number): SettingsSummary {
  return { title: chat?.title ?? '', characterCount }
}

/** The host's chat look and chat background, for guests to render with. */
function sharedAppearance(): SharedAppearance {
  const palette = activePalette()
  const background = resolveBackground(palette.backgrounds, 'chat')
  return {
    font: effectiveFont(palette),
    fontSize: palette.fontSize,
    lineHeight: palette.lineHeight,
    textColor: palette.textColor,
    emphasisColor: palette.emphasisColor,
    boldColor: palette.boldColor,
    quoteColor: palette.quoteColor,
    overwriteCharColor: palette.overwriteCharColor,
    colorOrder: palette.colorOrder,
    background: {
      // An uploaded image's bytes stay on the host: `imageId` has no meaning on a guest.
      url: background.url,
      fit: background.fit,
      excludeNav: background.excludeNav,
      css: background.css,
      html: background.html,
    },
  }
}

// --- admission -----------------------------------------------------------

/**
 * A guest persona is untrusted input off the wire. Cap the strings and size-check the avatar
 * before either can reach state: a 10 MB avatar or a 50 KB name is the case to handle.
 */
function validPersona(persona: GuestPersona | undefined): Participant | undefined {
  if (!persona || typeof persona.guestId !== 'string' || !persona.guestId) return undefined
  if (typeof persona.name !== 'string' || typeof persona.description !== 'string') return undefined
  const name = persona.name.trim()
  if (!name || name.length > maxPersonaName) return undefined
  if (persona.description.length > maxPersonaDescription) return undefined
  let avatar: string | undefined
  if (persona.avatar) {
    if (typeof persona.avatar !== 'string') return undefined
    if (!persona.avatar.startsWith('data:image/')) return undefined
    if (persona.avatar.length > maxAvatarBytes) return undefined
    avatar = persona.avatar
  }
  return {
    id: persona.guestId,
    name,
    description: persona.description,
    ...(avatar ? { avatar } : {}),
    isHost: false,
  }
}

/** A `hello` puts the guest in the lobby and nothing more. The host decides. */
function hello(persona: GuestPersona) {
  const participant = validPersona(persona)
  if (!participant) {
    sendEvent({ v: protocolVersion, type: 'decision', guestId: persona?.guestId ?? '', admitted: false, reason: 'That persona was rejected.' })
    return
  }
  const store = useMultiplayer.getState()
  // A colliding id is denied, not merged.
  if (store.participants.some((p) => p.id === participant.id)) {
    sendEvent({ v: protocolVersion, type: 'decision', guestId: participant.id, admitted: false, reason: 'That name is already in the room.' })
    return
  }
  if (store.lobby.some((p) => p.id === participant.id)) return
  store.addToLobby(participant)
}

function admit(guestId: string) {
  const store = useMultiplayer.getState()
  const guest = store.lobby.find((p) => p.id === guestId)
  if (!guest) return
  store.removeFromLobby(guestId)
  store.addParticipant(guest)
  store.setOrder(addParticipant(store.order, guestId), store.turnIndex)
  sendEvent({ v: protocolVersion, type: 'decision', guestId, admitted: true })
  pushSessionPersonas()
  broadcastState()
}

function deny(guestId: string, reason?: string) {
  useMultiplayer.getState().removeFromLobby(guestId)
  sendEvent({ v: protocolVersion, type: 'decision', guestId, admitted: false, reason })
}

function kick(guestId: string) {
  sendEvent({ v: protocolVersion, type: 'kick', guestId })
  dropParticipant(guestId)
}

/**
 * A departure, however it arrives. `bye` and a presence leave are the same handling and both can
 * arrive for one guest: the second is a no-op.
 */
function dropParticipant(id: string) {
  if (id === hostId) return
  const store = useMultiplayer.getState()
  store.removeFromLobby(id)
  pendingPersonas.delete(id)
  if (!store.participants.some((p) => p.id === id)) return
  // removeParticipant corrects the cursor: if it was their turn, it passes.
  store.removeParticipant(id)
  pushSessionPersonas()
  broadcastState()
}

// --- personas mid-session ------------------------------------------------

/**
 * Personas a guest has sent but which have not taken effect yet, keyed by participant id. A change
 * lands on the guest's next turn: a rewrite cannot change who was speaking in a line already
 * said or in a reply being generated for it.
 */
const pendingPersonas = new Map<string, Participant>()

function setPersonaLock(locked: boolean) {
  const store = useMultiplayer.getState()
  store.setPersonaLock(locked)
  // Locking drops what guests had queued: it stops taking effect, not "takes effect later".
  if (locked) {
    for (const id of [...pendingPersonas.keys()]) {
      if (!store.participants.find((p) => p.id === id)?.isHost) pendingPersonas.delete(id)
    }
  }
  broadcastState()
}

/** A guest's own rewrite. Rejected outright while the room is locked. */
function guestPersonaChange(guestId: string, persona: GuestPersona) {
  const store = useMultiplayer.getState()
  if (store.personaLock) return
  const participant = store.participants.find((p) => p.id === guestId)
  if (!participant || participant.isHost) return
  const next = validPersona({ ...persona, guestId })
  if (!next) return
  pendingPersonas.set(guestId, next)
  // Applied at once when it is not their turn: "next turn" is already now.
  if (store.order[store.turnIndex] !== guestId) applyPendingPersonas()
}

/** Move every queued persona that is not the turn holder's into the room. */
function applyPendingPersonas() {
  if (!pendingPersonas.size) return
  const store = useMultiplayer.getState()
  const holderId = store.order[store.turnIndex]
  let changed = false
  for (const [id, persona] of [...pendingPersonas]) {
    if (id === holderId) continue
    pendingPersonas.delete(id)
    if (!store.participants.some((p) => p.id === id)) continue
    store.setPersona(id, persona)
    changed = true
  }
  if (changed) {
    pushSessionPersonas()
    broadcastState()
  }
}

/** The host writing a room persona by hand, including their own. */
function hostSetPersona(id: string, persona: GuestPersona) {
  // Sticky for the rest of the session: a later stored-persona edit in Settings must not silently
  // replace the persona the host is playing right now.
  if (id === hostId) hostPersonaOverride = true
  writePersona(id, persona)
}

function writePersona(id: string, persona: GuestPersona) {
  const store = useMultiplayer.getState()
  if (!store.participants.some((p) => p.id === id)) return
  const next = validPersona({ ...persona, guestId: id })
  if (!next) return
  pendingPersonas.delete(id)
  store.setPersona(id, next)
  pushSessionPersonas()
  broadcastState()
}

/**
 * True once the host has written their own row from inside the room. Session-only: it is never
 * saved to a persona record, and `close()` drops it with everything else.
 */
let hostPersonaOverride = false

/** Last stored persona pushed into the room. Keeps an unrelated settings write from re-broadcasting. */
let lastStoredPersona = ''

/**
 * The host's row in the room follows the host's own persona: editing the active persona in Settings,
 * or switching which persona is active, rewrites the roster and the cast block for everyone. Guests
 * edit their own copy over the wire; the host edits the stored row and it flows from here. A
 * temporary persona set inside the room stops that following until the host clears it.
 */
async function syncHostPersona() {
  if (!live || hostPersonaOverride) return
  const activePersonaId = useSettings.getState().activePersonaId
  const personas = usePersonas.getState().personas
  const persona = personas.find((p) => p.id === activePersonaId) ?? personas[0]
  if (!persona) return
    const key = `${persona.id} ${persona.name} ${persona.description} ${persona.avatar}`
  if (key === lastStoredPersona) return
  lastStoredPersona = key
  const avatar = await downscaleAvatar(persona.avatar)
  if (!live || hostPersonaOverride) return
  writePersona(hostId, {
    guestId: hostId,
    name: persona.name,
    description: persona.description,
    ...(avatar ? { avatar } : {}),
  })
}

function watchHostPersona(): () => void {
  void syncHostPersona()
  const unsubscribePersonas = usePersonas.subscribe(() => void syncHostPersona())
  const unsubscribeSettings = useSettings.subscribe(() => void syncHostPersona())
  return () => {
    unsubscribePersonas()
    unsubscribeSettings()
  }
}

/** Drop the temporary persona and go back to following the stored one. */
function clearHostPersona() {
  if (!hostPersonaOverride) return
  hostPersonaOverride = false
  // The stored persona has not changed. The key would otherwise suppress the push putting it back.
  lastStoredPersona = ''
  void syncHostPersona()
}

// --- turns ---------------------------------------------------------------

function reorderTurn(from: number, to: number) {
  const store = useMultiplayer.getState()
  const holderId = store.order[store.turnIndex]
  const next = reorder(store.order, from, to)
  // The same person keeps the turn across a reorder; only their position changes.
  const index = next.indexOf(holderId)
  store.setOrder(next, index === -1 ? 0 : index)
  broadcastState()
}

function skipTurn() {
  const store = useMultiplayer.getState()
  store.setOrder(store.order, advance(store.order, store.turnIndex))
  applyPendingPersonas()
  broadcastState()
}

function advanceTurn() {
  const store = useMultiplayer.getState()
  store.setOrder(store.order, advance(store.order, store.turnIndex))
  applyPendingPersonas()
  broadcastState()
}

// --- the people in the room ---------------------------------------------

/**
 * The session's people, rebuilt whenever the participant list or anyone's persona changes, and
 * handed to `chatStore` to fill {{personas}}. Characters are not in here: the stack already reaches
 * them through {{char1}}…{{char4}}, and listing them twice would just spend the budget twice.
 *
 * Every instruction the Narrator gets now comes from the prompt stack. This is the only thing
 * the session pushes into the prompt layer.
 */
function pushSessionPersonas() {
  if (!live) return
  const personas: CastMember[] = useMultiplayer
    .getState()
    .participants.map((p) => ({ name: p.name, description: p.description }))
  setChatStorePersonas(castBlock(personas))
}

// --- the chat's name ----------------------------------------------------

/** Per-chat: the title belongs to this chat row, and renaming it touches nothing else. */
async function setTitle(title: string): Promise<void> {
  if (!live) return
  const chats = useChats.getState()
  if (chats.chat?.id !== live.chatId) await chats.load(live.chatId)
  await useChats.getState().patchChat({ title })
  // Keep the library list showing the new name without a reload of that screen.
  const chat = useChats.getState().chat
  if (chat) await useChats.getState().loadChats(chat.characterId)
  const store = useMultiplayer.getState()
  store.setSettings(settingsSummary(chat, store.characters.length))
  broadcastState()
}

// --- saying something ---------------------------------------------------

function handleGuestEvent(event: GuestEvent) {
  switch (event.type) {
    case 'hello':
      hello(event.persona)
      break
    case 'say':
      void applySay(event.guestId, event.text, event.responderId)
      break
    case 'bye':
      dropParticipant(event.guestId)
      break
    case 'persona':
      guestPersonaChange(event.guestId, event.persona)
      break
  }
}

/**
 * One turn: the speaker's message, exactly one reply, then the turn passes. The composer being
 * disabled on a guest's screen is a courtesy; this is the rule.
 */
async function applySay(speakerId: string, text: string, responderId: number): Promise<void> {
  if (!live) return
  const store = useMultiplayer.getState()
  const speaker = store.participants.find((p) => p.id === speakerId)
  if (!speaker) return
  if (store.order[store.turnIndex] !== speakerId) return
  if (typeof text !== 'string' || !text.trim()) return

  const chats = useChats.getState()
  if (chats.chat?.id !== live.chatId) await chats.load(live.chatId)
  // The prompt's char token resolves against the chat's opener, as it does in an ordinary group.
  const character = live.characters[0]

  pushSessionPersonas()
  // No personaId: a guest's id is a string and has no business in a numeric Dexie key, and a guest
  // must not be attributed to one of the host's personas.
  await useChats.getState().send(character, text, responderId, { name: speaker.name })

  // The cursor only moves on a reply that happened, mirroring chatStore's own rule.
  if (!useChats.getState().error) advanceTurn()
}

// --- broadcasting -------------------------------------------------------

/** Everything outward goes through `forGuests`. A `state` carries GuestMessage[], never Message[]. */
function broadcastState() {
  if (!live) return
  const store = useMultiplayer.getState()
  const chats = useChats.getState()
  const messages = chats.chat?.id === live.chatId ? chats.messages : []
  sendEvent({
    v: protocolVersion,
    type: 'state',
    participants: store.participants,
    order: store.order,
    turnIndex: store.turnIndex,
    characters: store.characters,
    narratorName: store.narratorName,
    settings: settingsSummary(chats.chat, store.characters.length),
    // Read fresh rather than from the store: the host's palette can change mid-session.
    appearance: sharedAppearance(),
    messages: messages.slice(-stateMessageWindow).map(forGuests),
    personaLock: store.personaLock,
  })
}

function sendEvent(event: HostEvent) {
  live?.channel.send(event)
}

// --- the stream relay ---------------------------------------------------

/**
 * Relays `streamingText` as `stream` events, throttled trailing-edge: the last chunk before
 * completion is not lost. `text` is the full text so far rather than a delta: a dropped event
 * self-heals. Returns the unsubscribe.
 */
/**
 * True when the transcript changed in a way `append` cannot carry: a line removed, or a line's id or
 * content rewritten. A plain append is false: the relay sends that as an `append`.
 */
function revised(previous: Message[], next: Message[]): boolean {
  if (next.length < previous.length) return true
  for (let i = 0; i < previous.length; i++) {
    if (previous[i].id !== next[i].id) return true
    if (previous[i].content !== next[i].content) return true
  }
  return false
}

function startStreamRelay(chatId: number): () => void {
  let key = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  let sentAt = 0
  let pending: { text: string; speakerName: string } | undefined

  function flush() {
    timer = undefined
    if (!pending) return
    sentAt = Date.now()
    sendEvent({ v: protocolVersion, type: 'stream', key, text: pending.text, speakerName: pending.speakerName })
    pending = undefined
  }

  const unsubscribe = useChats.subscribe((state, previous) => {
    // A turn's message is stored and reloaded before the request goes out. This fires while the
    // reply is still being waited on: guests see the line as soon as it is said rather than when
    // the reply lands. Whoever said it, host or guest, it arrives through the same `send`.
    if (state.chat?.id === chatId && state.messages.length > previous.messages.length) {
      const last = state.messages.at(-1)
      if (last?.role === 'user') {
        sendEvent({ v: protocolVersion, type: 'append', message: forGuests(last) })
      }
    }

    // An edit, a delete or a swipe change rewrites lines guests already have, and `append` can only
    // add. A fresh `state` is the whole window: it corrects whatever moved without a new event
    // type. Only the window's worth: guests never held anything older.
    if (state.chat?.id === chatId && revised(previous.messages, state.messages)) {
      broadcastState()
    }

    // The host may have another chat open in another tab.
    const mine = state.streamingChatId === chatId || previous.streamingChatId === chatId

    if (state.streaming && mine) {
      if (!previous.streaming) key = `${chatId}:${Date.now()}`
      pending = { text: state.streamingText, speakerName: state.speakingName }
      const wait = Math.max(0, streamIntervalMs - (Date.now() - sentAt))
      if (!timer) timer = setTimeout(flush, wait)
      return
    }

    if (previous.streaming && !state.streaming && mine) {
      if (timer) clearTimeout(timer)
      timer = undefined
      pending = undefined
      // The reply is stored and reloaded by chatStore before `streaming` clears, so the last
      // assistant message is the one that just landed.
      const last: Message | undefined = state.messages.at(-1)
      if (last?.role === 'assistant') {
        sendEvent({ v: protocolVersion, type: 'append', message: forGuests(last) })
      }
    }
  })

  return () => {
    if (timer) clearTimeout(timer)
    unsubscribe()
  }
}

// --- ending -------------------------------------------------------------

function close() {
  sendEvent({ v: protocolVersion, type: 'end' })
  stopRelay?.()
  stopRelay = undefined
  stopPersonaWatch?.()
  stopPersonaWatch = undefined
  hostPersonaOverride = false
  lastStoredPersona = ''
  live?.channel.close()
  live = undefined
  pendingPersonas.clear()
  session = undefined
  setChatStorePersonas(undefined)
  setSessionCast(undefined)
  useMultiplayer.getState().reset()
}
