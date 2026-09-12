import type { Character } from '../storage/types'
import { emptyColors } from '../storage/types.ts'

/**
 * The Narrator's fixed id. Negative: it can never collide with a Dexie autoincrement key.
 * The Narrator carries no `lorebookIds`. A turn of theirs sees only the global books and the
 * ones attached to the chat.
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
 * never stored. Returns an empty string when there is nobody to describe, and a member with an
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
 * else. Every instruction the Narrator gets comes from the prompt stack's `[if Narrator]` branch.
 * There is deliberately no description here: a card field would be a second, invisible source
 * of narrator instructions that the stack editor could not show or override.
 *
 * Never written to Dexie: `ownerId` is '', and it does not look like a persistable record.
 */
export function narratorCharacter(): Character {
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
    // The narrator is not a card: it has no author and nothing to override the stack with.
    systemPrompt: '',
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
