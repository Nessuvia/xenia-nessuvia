// Extension-ful imports on purpose: checkSentinel.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { StreamChunk } from './connectorInterface.ts'
import { parseSse } from './connectorInterface.ts'
import { loremStream } from './dummy.ts'
import { explainers, roulette } from './sentinelReplies.ts'

/**
 * A host that is a string, not a server. Nothing resolves it and nothing may contact it: every
 * outward path checks `isSentinel` first and answers locally instead.
 *
 * It is a magic URL rather than a flag on the connection record: a flag fails open. A
 * connection copied out of a backup, typed by hand, or imported from someone else would lose the
 * flag and start making real requests to a host that does not exist. The URL travels with the
 * record; the check cannot be separated from the thing it protects. The reply states what it is,
 * telling a user who ends up here by accident what to fix.
 */
export const sentinelHost = 'xenia.nessuvia.com'

/** The first thing anyone sees from this connection. Every explainer says the same fact. */
export const sentinelReply = explainers[0]

/**
 * The reply for the nth message of the session, counting from 0.
 *
 * The explainers come first, in order: the first few sends read as the app repeating itself
 * rather than as something generating text. Past the end of that list, the rest is a random draw
 * from `roulette`.
 *
 * Pure. `avoid` and `rand` are arguments rather than module state, letting `checkSentinel.ts`
 * pin the draw.
 */
export function pickSentinelReply(
  count: number,
  /** The previous reply: the same line does not come back twice running. */
  avoid?: string,
  rand: () => number = Math.random,
): string {
  if (count < explainers.length) return explainers[count]
  // Dropping `avoid` can empty the list if roulette ever holds one line. Falls back to all of it.
  const pool = roulette.filter((r) => r !== avoid)
  const from = pool.length ? pool : roulette
  return from[Math.floor(rand() * from.length)]
}

// How many sentinel replies this page load has produced, and the last one, for the no-repeat rule.
// Deliberately module state and deliberately not persisted: a reload starts again at the first
// explainer.
let sentCount = 0
let lastReply: string | undefined

/** One canned model, for the model picker on a sentinel connection. */
export const sentinelModel = 'xenia-tutorial'

/** The context limit reported for a sentinel connection. */
export const sentinelContextLimit = 8192

/**
 * True when this endpoint points at the sentinel host, with or without a scheme, port, or path.
 * Matches the host exactly: `notxenia.nessuvia.com` and `xenia.nessuvia.com.evil.test` are other
 * hosts and get the normal live path.
 */
export function isSentinel(endpointUrl: string): boolean {
  const trimmed = (endpointUrl ?? '').trim().toLowerCase()
  if (!trimmed) return false
  // Hand-typed URLs often have no scheme, and `new URL` refuses those. Parse the authority by
  // hand: everything after '//' (if any) and before the first '/', '?' or '#', minus userinfo and
  // port.
  const afterScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  const authority = afterScheme.split(/[/?#]/)[0]
  const host = authority.split('@').pop()!.split(':')[0]
  return host === sentinelHost
}

/** The sentinel's stand-in for a backend, streamed as real SSE through the live parser. */
export async function* sendSentinelMessage(signal?: AbortSignal): AsyncGenerator<StreamChunk> {
  const reply = pickSentinelReply(sentCount, lastReply)
  sentCount += 1
  lastReply = reply
  yield* parseSse(loremStream(reply, signal))
}
