import type { Character } from '../storage/types'
import { emptyColors } from '../storage/types.ts'

/**
 * The Narrator's fixed id. Negative: it can never collide with a Dexie autoincrement key.
 * The Narrator carries no `lorebookIds` of its own. `chatStore.worldInfoFor` borrows the roster's
 * instead, so a narrated turn sees the same world the characters do.
 */
export const narratorId = -1

/** Shown in the roster and the responder picker. Not editable in Phase 1. */
export const narratorName = 'Narrator'

/** A person the prompt needs to describe, for the persona block. */
export interface CastMember {
  name: string
  description: string
}

/**
 * `Name: description` lines, one per member, for the `{{personas}}` token. Generated at send time,
 * never stored. Returns an empty string when there's nobody to describe, and a member with an
 * empty or whitespace-only description is omitted entirely.
 */
export function castBlock(members: CastMember[]): string {
  return members
    .filter((m) => m.description.trim() !== '')
    .map((m) => `${m.name}: ${m.description}`)
    .join('\n')
}

/**
 * A Character-shaped Narrator for `buildPrompt`: a speaker with a name and an id, and nothing
 * else worth reading.
 *
 * `systemPrompt` is the one exception, and it's a fallback rather than a second voice. A stack
 * that has an `[if Narrator]` branch owns the Narrator, and the caller passes nothing here. Only
 * a stack that never mentions the Narrator gets its `narrator` misc prompt, which lands in the
 * same slot a character's own system prompt would. The caller decides which case it is; see
 * `mentionsCondition` in core/prompt/conditions.ts and the narrator branch of `chatStore.retry`.
 * Description, personality and scenario stay empty on purpose: those would be invisible narrator
 * instructions the stack editor could neither show nor override.
 *
 * Never written to Dexie: `ownerId` is '', and it doesn't look like a persistable record.
 */
export function narratorCharacter(systemPrompt = ''): Character {
  return {
    id: narratorId,
    ownerId: '',
    name: narratorName,
    avatar: '',
    description: '',
    personality: '',
    scenario: '',
    firstMessage: '',
    exampleDialogue: '',
    altDescriptions: [],
    activeDescriptionIndex: -1,
    alternateGreetings: [],
    gallery: [],
    tags: [],
    // Empty unless the stack said nothing about the Narrator. See the note above.
    systemPrompt,
    postHistoryInstructions: '',
    creatorNotes: '',
    creator: '',
    characterVersion: '',
    createdAt: 0,
    updatedAt: 0,
    colors: emptyColors(),
  }
}

/** True for the synthetic Narrator. Use this rather than comparing to `narratorId` inline. */
export function isNarrator(id: number | undefined): boolean {
  return id === narratorId
}
