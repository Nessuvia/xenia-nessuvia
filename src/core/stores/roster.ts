// Extension-ful imports on purpose: checkGroupPrompt.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { Chat } from '../storage/types'

/**
 * The characters in the room, in speaking order. A solo chat is a roster of one. The send path
 * never needs an `isGroup` branch: `characterId` stays pinned to the first participant.
 */
export function participants(chat: Chat): number[] {
  return chat.participantIds?.length ? chat.participantIds : [chat.characterId]
}

export function isGroup(chat: Chat): boolean {
  return participants(chat).length > 1
}

/**
 * Round robin: the participant after `lastSpeakerIndex`, wrapping. A cursor left pointing past the
 * end (the character it named was removed) wraps like any other value rather than throwing.
 *
 * Round robin plus a click. Heuristic speaker selection is in the deferred table.
 */
export function nextSpeakerIndex(chat: Chat): number {
  const count = participants(chat).length
  const last = chat.lastSpeakerIndex ?? -1
  return (((last + 1) % count) + count) % count
}

/**
 * How many replies one user message draws. Capped at the roster size: the cap stops a
 * character being asked to speak twice in the same run. A count of 5 in a room of three is
 * three replies, not five.
 */
export function autoTurns(chat: Chat): number {
  if (!chat.selfReply) return 1
  const asked = Math.floor(chat.selfReplyCount ?? 1)
  return Math.min(Math.max(1, asked), participants(chat).length)
}

/** The character id whose turn it is. */
export function nextSpeakerId(chat: Chat): number {
  return participants(chat)[nextSpeakerIndex(chat)]
}
