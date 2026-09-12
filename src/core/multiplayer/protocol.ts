import type { Message } from '../storage/types'
import type { BackgroundFit } from '../palette/palette'
import type { MarkerKind } from '../stores/settingsStore'

/** Bumped only on a breaking change to any event shape. Guests reject a mismatch. */
export const protocolVersion = 3

/** Realtime's payload cap is 256 KB. Stay under it with room for the envelope. */
export const maxEventBytes = 240_000

export interface GuestPersona {
  guestId: string
  name: string
  description: string
  /** Base64 data URI, already downscaled to 256px by the sender. */
  avatar?: string
}

/** A participant in the turn order: the host, or an admitted guest. */
export interface Participant {
  id: string
  name: string
  description: string
  avatar?: string
  isHost: boolean
}

/** A character in the session roster, as guests see it. No rawCard, no full-size avatar. */
export interface RosterCharacter {
  id: number
  name: string
  avatar?: string
}

/** What a guest is allowed to see of a stored message. */
export interface GuestMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  personaName?: string
  speakerName?: string
  createdAt: number
}

/** The read-only settings summary guests see in the left panel. */
export interface SettingsSummary {
  title: string
  characterCount: number
}

/**
 * The host's look, so everyone in the room sees the same scene. Only what the room paints with:
 * the chat text vars and the `chat` slot's background, already resolved over the baseline.
 *
 * The background's `css` and `html` are the host's own, and are rendered through the same
 * sanitizeBackgroundHtml/scopeBackgroundCss path as a local background, never innerHTML.
 * An uploaded image lives in the host's `backgroundImages` table and its bytes are not sent.
 * Only `url` travels, and a host on an uploaded image shows guests no image.
 */
export interface SharedAppearance {
  font: string
  fontSize: number
  lineHeight: number
  textColor: string
  emphasisColor: string
  boldColor: string
  quoteColor: string
  overwriteCharColor: boolean
  colorOrder: MarkerKind[]
  background: {
    url: string
    fit: BackgroundFit
    excludeNav: boolean
    css: string
    html: string
  }
}

// --- guest → host --------------------------------------------------------

export interface HelloEvent {
  v: number
  type: 'hello'
  persona: GuestPersona
}

export interface SayEvent {
  v: number
  type: 'say'
  guestId: string
  text: string
  /** Which character replies. `narratorId` when undirected. */
  responderId: number
}

export interface ByeEvent {
  v: number
  type: 'bye'
  guestId: string
}

/**
 * A guest rewriting its own persona mid-session. The host validates it exactly as it validates a
 * `hello`, then holds it until the guest's turn passes: a persona never changes under a line that
 * has already been said.
 */
export interface PersonaEvent {
  v: number
  type: 'persona'
  guestId: string
  persona: GuestPersona
}

export type GuestEvent = HelloEvent | SayEvent | ByeEvent | PersonaEvent

// --- host → all ----------------------------------------------------------

export interface StateEvent {
  v: number
  type: 'state'
  participants: Participant[]
  /** Participant ids, in speaking order. */
  order: string[]
  turnIndex: number
  characters: RosterCharacter[]
  narratorName: string
  settings: SettingsSummary
  appearance: SharedAppearance
  messages: GuestMessage[]
  /** True when the host has locked persona editing. Guests hide the editor, and the host still
   *  ignores any `persona` that arrives: a locked room holds even against a patched client. */
  personaLock: boolean
}

export interface AppendEvent {
  v: number
  type: 'append'
  message: GuestMessage
}

export interface StreamEvent {
  v: number
  type: 'stream'
  /** Identifies the in-flight reply so a guest can replace rather than append. */
  key: string
  /** The full text so far, not a delta: a dropped event self-heals. */
  text: string
  speakerName: string
}

export interface DecisionEvent {
  v: number
  type: 'decision'
  guestId: string
  admitted: boolean
  reason?: string
}

export interface KickEvent {
  v: number
  type: 'kick'
  guestId: string
}

export interface EndEvent {
  v: number
  type: 'end'
}

export type HostEvent = StateEvent | AppendEvent | StreamEvent | DecisionEvent | KickEvent | EndEvent

export type MultiplayerEvent = GuestEvent | HostEvent

const guestTypes = new Set(['hello', 'say', 'bye', 'persona'])
const hostTypes = new Set(['state', 'append', 'stream', 'decision', 'kick', 'end'])
const knownTypes = new Set([...guestTypes, ...hostTypes])

// --- functions -----------------------------------------------------------

/**
 * Strip a stored Message to what a guest may see. The only outward path for message data.
 * Drops requestSnapshots (the request itself, and up to ~256 KB per swipe), swipes, reasonings,
 * and every id except the message's own. Builds a fresh object rather than spreading and deleting:
 * a field added to `Message` later never leaks through.
 */
export function forGuests(message: Message): GuestMessage {
  return {
    id: message.id!,
    role: message.role,
    content: message.content,
    personaName: message.personaName,
    speakerName: message.speakerName,
    createdAt: message.createdAt,
  }
}

/** False when the serialized event would exceed the Realtime payload cap. */
export function withinSizeLimit(event: MultiplayerEvent): boolean {
  return JSON.stringify(event).length <= maxEventBytes
}

/**
 * Narrow an unknown payload off the wire. Returns undefined on a version mismatch, a missing or
 * unrecognised `type`, or a payload over the size cap. Never throws.
 */
export function parseEvent(raw: unknown): MultiplayerEvent | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const e = raw as Record<string, unknown>
  if (e.v !== protocolVersion) return undefined
  if (typeof e.type !== 'string' || !knownTypes.has(e.type)) return undefined
  if (!withinSizeLimit(e as unknown as MultiplayerEvent)) return undefined
  return e as unknown as MultiplayerEvent
}
