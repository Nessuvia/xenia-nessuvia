/**
 * The only file that touches Centrifugo, the relay the user runs themselves. See
 * `resources/self-hosted-relay.md` for the server side.
 *
 * A transport and nothing more: events are opaque typed payloads here. No decision belongs in this
 * file.
 *
 * ## Why presence is rebuilt from announcements
 *
 * Nobody signs in, host included. Every connection here is anonymous. Centrifugo fills a
 * presence entry's `user` and `connInfo` from the connection's JWT, and an anonymous connection has
 * neither. A presence row says a connection exists and nothing about *whose* it is. The
 * handlers need whose: `onLeave(member)` is what drops a participant from the roster.
 *
 * What a publication does carry is `info.client`, the publisher's connection id. Identity is
 * correlated rather than read: each client announces `{clientId → PresenceMember}` on the channel,
 * everyone keeps the map, and a `leave` push is resolved through it. `onJoin` fires on the
 * announcement, not on the raw join push: an unidentified connection is nobody yet, and the host
 * admits nobody on presence alone in any case.
 */
import { Centrifuge } from 'centrifuge'
import type { PublicationContext, JoinContext, LeaveContext, Subscription } from 'centrifuge'
import { parseEvent, withinSizeLimit } from './protocol'
import type { Channel, ChannelHandlers, PresenceMember } from './channel'

/** How long to wait for the subscription before calling the relay unreachable. Centrifugo's client
 *  retries a dead endpoint forever without ever resolving. The wait is ours to bound. */
const connectTimeoutMs = 10_000

/**
 * What travels on the channel. Exactly one field is set: `e` is a protocol event, `a` is this
 * layer's own identity announcement. Keeping the announcement out of `e` is what lets `protocol.ts`
 * stay untouched: `parseEvent` never sees a frame it does not know, and `protocolVersion` does not
 * move for a transport detail.
 */
interface Envelope {
  e?: unknown
  a?: PresenceMember
}

export function openCentrifugoChannel(
  url: string,
  sessionId: string,
  me: PresenceMember,
  handlers: ChannelHandlers,
): Channel {
  const client = new Centrifuge(url)
  // `mp` is a Centrifugo namespace, configured with presence and join/leave. The session id is
  // unguessable and the channel is public.
  const sub: Subscription = client.newSubscription(`mp:${sessionId}`)

  /** Centrifugo connection id → who that connection is. Filled by announcements. */
  const members = new Map<string, PresenceMember>()
  /** This connection's own id, from the connect reply. Used to drop our own echoes. */
  let myClientId = ''
  let closed = false
  let ready = false

  /** onReady is a one-shot: a reconnect resubscribes and must not re-report. */
  function reportReady(error?: string) {
    if (ready || closed) return
    ready = true
    handlers.onReady(error)
  }

  const timer = setTimeout(() => {
    reportReady('The room connection failed (the relay did not respond).')
  }, connectTimeoutMs)

  function announce() {
    void sub.publish({ a: me } satisfies Envelope).catch(() => {})
  }

  client.on('connected', (ctx) => {
    myClientId = ctx.client
  })

  client.on('error', (ctx) => {
    reportReady(`The room connection failed (${ctx.error.message}).`)
  })

  sub.on('subscribed', () => {
    clearTimeout(timer)
    reportReady()
    // Also on a resubscribe after a drop: the others' maps still hold our old connection id, which
    // no longer exists, so we have to say who we are under the new one.
    announce()
  })

  sub.on('error', (ctx) => {
    clearTimeout(timer)
    reportReady(`The room connection failed (${ctx.error.message}).`)
  })

  sub.on('publication', (ctx: PublicationContext) => {
    // Centrifugo echoes our own publications back. The host applies its own actions locally and
    // then broadcasts. An echo would double-apply.
    if (ctx.info?.client && ctx.info.client === myClientId) return

    const envelope = ctx.data as Envelope | null
    if (typeof envelope !== 'object' || envelope === null) return

    if (envelope.a) {
      const member = asMember(envelope.a)
      // No `info` means a server-API publish, which nothing in this app does. Without the
      // publisher's connection id there is nothing to correlate a later leave against.
      if (!member || !ctx.info?.client) return
      if (member.id === me.id) return
      const known = members.get(ctx.info.client)
      members.set(ctx.info.client, member)
      if (!known) handlers.onJoin(member)
      return
    }

    if (envelope.e !== undefined) {
      // A guest can send anything. A payload that fails to parse is dropped, not surfaced.
      const event = parseEvent(envelope.e)
      if (event) handlers.onEvent(event)
    }
  })

  sub.on('join', (ctx: JoinContext) => {
    if (ctx.info.client === myClientId) return
    // The newcomer has no map yet, and everyone already here re-announces. This is what lets a
    // guest's host-presence check find the host. A room is a handful of people; the traffic is
    // one small frame each.
    announce()
  })

  sub.on('leave', (ctx: LeaveContext) => {
    const member = members.get(ctx.info.client)
    if (!member) return
    members.delete(ctx.info.client)
    handlers.onLeave(member)
  })

  sub.subscribe()
  client.connect()

  return {
    send(event) {
      if (closed) return false
      // Over the cap returns false rather than throwing; hostSession decides what to do.
      if (!withinSizeLimit(event)) return false
      void sub.publish({ e: event } satisfies Envelope).catch(() => {})
      return true
    },

    members() {
      return [...members.values()]
    },

    close() {
      if (closed) return
      closed = true
      clearTimeout(timer)
      sub.unsubscribe()
      client.removeSubscription(sub)
      client.disconnect()
      members.clear()
    },
  }
}

/** An announcement is whatever the other side published. Guard the shape. */
function asMember(raw: unknown): PresenceMember | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string') return undefined
  return { id: row.id, isHost: row.isHost === true }
}
