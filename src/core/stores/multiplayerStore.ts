import { create } from 'zustand'
// No `persist`: this store is memory only. A guest's tab writes nothing to localStorage and
// nothing to Dexie, and its state dies with the tab.
import type {
  GuestMessage,
  Participant,
  RosterCharacter,
  SettingsSummary,
  SharedAppearance,
} from '../multiplayer/protocol'
import { removeParticipant } from '../multiplayer/turnOrder'

export type SessionRole = 'host' | 'guest'

export type SessionPhase =
  | 'idle'        // no session
  | 'connecting'  // channel subscribing
  | 'waiting'     // guest: hello sent, awaiting a decision
  | 'live'        // in the room
  | 'denied'      // guest: admission refused
  | 'ended'       // host closed the room, or the channel dropped

export interface MultiplayerState {
  role: SessionRole
  phase: SessionPhase
  sessionId: string | null
  /** This client's participant id. The host's id, or a guest's client-generated guestId. */
  meId: string | null
  /** Why the session is in `denied` or `ended`. Shown to the user verbatim. */
  reason: string

  participants: Participant[]
  order: string[]
  turnIndex: number
  characters: RosterCharacter[]
  narratorName: string
  settings: SettingsSummary | null
  /** The host's look: the room paints the same for everyone. Only guests render from it; the
   *  host has the palette itself. Null before the first `state`. */
  appearance: SharedAppearance | null

  /** True when guests may not edit their own persona. The host owns it; guests read it. */
  personaLock: boolean

  /** Guest-side: the whole transcript, in memory. Host-side: empty, the host reads Dexie. */
  messages: GuestMessage[]
  /** The in-flight reply, keyed as in StreamEvent. Null between replies. */
  streaming: { key: string; text: string; speakerName: string } | null

  /** Host-side: guests who have sent `hello` and are awaiting a decision. */
  lobby: Participant[]

  begin(role: SessionRole, sessionId: string, meId: string): void
  setPhase(phase: SessionPhase, reason?: string): void
  /** Replace everything a `state` event carries. The guest's primary update path. */
  applyState(snapshot: Pick<MultiplayerState,
    'participants' | 'order' | 'turnIndex' | 'characters' | 'narratorName' | 'settings'
    | 'appearance' | 'messages' | 'personaLock'
  >): void
  /** Host-side: the summary the left panel reads, after the chat's title changes. */
  setSettings(settings: SettingsSummary): void
  appendMessage(message: GuestMessage): void
  setStreaming(streaming: MultiplayerState['streaming']): void

  setOrder(order: string[], turnIndex: number): void
  addParticipant(participant: Participant): void
  removeParticipant(id: string): void

  addToLobby(participant: Participant): void
  removeFromLobby(id: string): void

  setPersonaLock(locked: boolean): void
  /** Replace one participant's identity fields, keeping its place in the order. Host-side. */
  setPersona(id: string, persona: Pick<Participant, 'name' | 'description' | 'avatar'>): void

  /** Back to `idle` with every field at its initial value. Called on teardown. */
  reset(): void
}

/** The data half of the store. `reset()` sets exactly this, so no field can survive a session. */
type SessionData = Omit<MultiplayerState,
  | 'begin' | 'setPhase' | 'applyState' | 'setSettings' | 'appendMessage' | 'setStreaming' | 'setOrder'
  | 'addParticipant' | 'removeParticipant' | 'addToLobby' | 'removeFromLobby'
  | 'setPersonaLock' | 'setPersona' | 'reset'
>

const initialState: SessionData = {
  role: 'host',
  phase: 'idle',
  sessionId: null,
  meId: null,
  reason: '',
  participants: [],
  order: [],
  turnIndex: 0,
  characters: [],
  narratorName: '',
  settings: null,
  appearance: null,
  personaLock: false,
  messages: [],
  streaming: null,
  lobby: [],
}

export const useMultiplayer = create<MultiplayerState>((set) => ({
  ...initialState,
  begin(role, sessionId, meId) {
    set({ role, phase: 'idle', sessionId, meId })
  },
  setPhase(phase, reason) {
    set({ phase, ...(reason !== undefined && { reason }) })
  },
  applyState(snapshot) {
    // A snapshot supersedes anything in flight: whatever was streaming is either in `messages` now
    // or was abandoned. Leaving it set would draw the reply twice, once with a stuck caret.
    set(() => ({ ...snapshot, streaming: null }))
  },
  setSettings(settings) {
    set({ settings })
  },
  appendMessage(message) {
    set((state) => ({
      messages: [...state.messages, message],
      // The finished reply is the stream: the bubble the caret was in becomes this message. A
      // user message is a turn being said and leaves anything in flight alone.
      streaming: message.role === 'assistant' ? null : state.streaming,
    }))
  },
  setStreaming(streaming) {
    set({ streaming })
  },
  setOrder(order, turnIndex) {
    set({ order, turnIndex })
  },
  addParticipant(participant) {
    set((state) => ({
      participants: [...state.participants, participant],
    }))
  },
  removeParticipant(id) {
    set((state) => {
      const { order: newOrder, turnIndex: newIndex } = removeParticipant(state.order, state.turnIndex, id)
      return {
        participants: state.participants.filter(p => p.id !== id),
        order: newOrder,
        turnIndex: newIndex,
      }
    })
  },
  addToLobby(participant) {
    set((state) => ({
      lobby: [...state.lobby, participant],
    }))
  },
  removeFromLobby(id) {
    set((state) => ({
      lobby: state.lobby.filter(p => p.id !== id),
    }))
  },
  setPersonaLock(locked) {
    set({ personaLock: locked })
  },
  setPersona(id, persona) {
    set((state) => ({
      participants: state.participants.map((p) =>
        p.id === id
          ? {
              id: p.id,
              isHost: p.isHost,
              name: persona.name,
              description: persona.description,
              ...(persona.avatar ? { avatar: persona.avatar } : {}),
            }
          : p,
      ),
    }))
  },
  reset() {
    set(initialState)
  },
}))

/** Whether this client holds the turn. Selector, not state. */
export function isMyTurn(state: MultiplayerState): boolean {
  const holderId = state.order[state.turnIndex]
  return holderId === state.meId
}

/** The participant holding the turn, or undefined. Selector, not state. */
export function currentHolder(state: MultiplayerState): Participant | undefined {
  const holderId = state.order[state.turnIndex]
  return state.participants.find(p => p.id === holderId)
}
