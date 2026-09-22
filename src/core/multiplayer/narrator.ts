import type { Character, Persona } from '../storage/types'
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

/**
 * The user's side of the same idea: you pick this in the persona switcher and your own messages
 * are direction for the scene rather than a character speaking. Shares `narratorId` with the
 * responder-side Narrator on purpose. Personas and characters are separate id spaces, and it's the
 * same role from the other chair.
 *
 * Unlike `narratorCharacter`, this one ships a description. It's the whole feature: nothing tells
 * the model how to read the user's line except the persona's own description, and a fresh install
 * has no persona to put it in. `personasStore.load` appends this to the list, so every existing
 * `personas.find(p => p.id === activePersonaId)` resolves it without a special case. It's never
 * written to Dexie: `save` and `remove` refuse it.
 */
export function narratorPersona(): Persona {
  return {
    id: narratorId,
    ownerId: '',
    name: narratorName,
    avatar: '',
    description: `{{user}} is the Narrator: the storyteller outside the cast, not a character in the scene and not someone the characters can see or address.

A message from the Narrator is direction for what happens next. Treat it as an event in the world, not as speech aimed at anyone. Never have a character answer it or repeat it back.`,
    createdAt: 0,
    updatedAt: 0,
    colors: emptyColors(),
  }
}

/** The list without the built-in Narrator: what counts for "you need at least one persona". */
export function realPersonas(personas: Persona[]): Persona[] {
  return personas.filter((p) => !isNarrator(p.id))
}
