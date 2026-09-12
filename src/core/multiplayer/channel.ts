/**
 * The transport a session runs over.
 *
 * Everything above this (`hostSession.ts`, `JoinView`, the store, the room) holds a `Channel` and
 * never talks to the relay directly. `centrifugoChannel.ts` talks to a relay the user runs
 * (`resources/self-hosted-relay.md`).
 */
import type { MultiplayerEvent } from './protocol'
import type { RelayConfig } from './relayConfig'
import { openCentrifugoChannel } from './centrifugoChannel'

export interface PresenceMember {
  id: string
  isHost: boolean
}

export interface ChannelHandlers {
  onEvent(event: MultiplayerEvent): void
  onJoin(member: PresenceMember): void
  onLeave(member: PresenceMember): void
  /** Called once when the subscription is live, or with an error if it never came up. */
  onReady(error?: string): void
}

export interface Channel {
  /** Fire and forget. Returns false when the event was dropped for exceeding the size cap. */
  send(event: MultiplayerEvent): boolean
  /** Everyone currently on the channel. */
  members(): PresenceMember[]
  /** Unsubscribe and release. Safe to call twice. */
  close(): void
}

/**
 * Open the channel for a session. `me` is this client's presence identity: the host's id or a
 * guest's client-generated guestId. Throws when the chosen relay is not usable, which is a state
 * the caller presents rather than an error to swallow.
 */
export function openChannel(
  config: RelayConfig,
  sessionId: string,
  me: PresenceMember,
  handlers: ChannelHandlers,
): Channel {
  return openCentrifugoChannel(config.url, sessionId, me, handlers)
}

/** A new session id: 22 URL-safe characters, unguessable, never reused. */
export function newSessionId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 22)
}
