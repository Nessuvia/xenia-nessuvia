import type { BlockInput, Character, Persona } from '../storage/types'
import { activeDescription } from '../storage/types.ts'
import { stripComments } from './stripComments.ts'

/**
 * Every `{{token}}` the prompt layer understands, and what each one stands for. The card fields
 * mirror the bound `BlockSource`s one for one: anything a block can bind to, a token can paste
 * inline. Keys are lowercase because tokens match case-insensitively and are looked up folded.
 */
export interface TokenValues {
  char: string
  user: string
  /** Card fields, already token-swapped once, see `characterTokens`. */
  chardescription?: string
  charpersonality?: string
  charscenario?: string
  charexampledialogue?: string
  personadescription?: string
  /** Multiplayer cast slots, see `castTokens`. Absent outside a session. */
  char1?: string
  char2?: string
  char3?: string
  char4?: string
  char1desc?: string
  char2desc?: string
  char3desc?: string
  char4desc?: string
  /** Every person in a multiplayer session, `Name: description` per line. Absent outside one. */
  personas?: string
  /** The game being played, by its title ('Go Fish', 'Blackjack'). Absent everywhere but the
   *  games module, which leaves {{game}} in place in an ordinary chat. */
  game?: string
}

/** Cast slots a prompt can address positionally. Also the roster cap in `hostSession`. */
export const castSlots = 4

const tokenPattern =
  /\{\{(char|user|charDescription|charPersonality|charScenario|charExampleDialogue|personaDescription|personas|game|char[1-4]|char[1-4]Desc)\}\}/gi

/**
 * Substitutes the known tokens. Unknown {{tokens}} are left exactly as they are, except for ST's
 * {{// comments}}, which are dropped: see `stripComments`. Comments go first, so a token inside one
 * is never swapped.
 */
export function swapTokens(text: string, values: TokenValues): string {
  return stripComments(text).replace(tokenPattern, (whole, token: string) => {
    // Tokens match case-insensitively, so look them up folded.
    const value = values[token.toLowerCase() as keyof TokenValues]
    return value ?? whole
  })
}

/**
 * Token values for a character, and for the persona when one is in play. Each field is swapped
 * once here, so a card that writes {{char}} in its own text reads correctly when
 * {{charDescription}} pastes it somewhere else. That single pass is deliberate: a description
 * containing {{charDescription}} leaves the token in place rather than expanding forever.
 */
export function characterTokens(
  character: Character,
  userName: string,
  /** The active persona's description. Absent where there is no persona (Ask). */
  personaDescription = '',
): TokenValues {
  const base = { char: character.name, user: userName }
  const once = (text: string) => swapTokens(text || '', base)
  return {
    ...base,
    chardescription: once(activeDescription(character)),
    charpersonality: once(character.personality),
    charscenario: once(character.scenario),
    charexampledialogue: once(character.exampleDialogue),
    personadescription: once(personaDescription),
  }
}

/**
 * Positional cast values: `{{char2}}` is the second character of the session roster and
 * `{{char2Desc}}` its description. A slot with no character resolves to '', the prompt keeps its
 * shape and the sentence about a character who isn't there comes out blank.
 *
 * Each description is swapped once against its own character, same single pass as
 * `characterTokens`, so a card writing {{char}} in its description looks like that character here.
 */
export function castTokens(cast: Character[], userName: string): Partial<TokenValues> {
  const values: Record<string, string> = {}
  for (let i = 0; i < castSlots; i++) {
    const c = cast[i]
    values[`char${i + 1}`] = c ? c.name : ''
    values[`char${i + 1}desc`] = c
      ? swapTokens(activeDescription(c) || '', { char: c.name, user: userName })
      : ''
  }
  return values as Partial<TokenValues>
}

/**
 * The same values from a Persona row: the shape every chat-side caller already has.
 * `cast` is the multiplayer roster in host-chosen order. Without it the slot tokens are left out
 * entirely, so a stray {{char2}} in a solo chat stays visible rather than silently vanishing.
 *
 * `personas` is the session's people as `Name: description` lines, already assembled by the caller,
 * the same arrangement `worldInfo` has in `buildPrompt`, and for the same reason: the roster
 * lives in the multiplayer store and this function stays pure. Absent outside a session, so
 * {{personas}} stays visible in an ordinary chat rather than blanking.
 */
export function chatTokens(
  character: Character,
  persona: Persona,
  cast?: Character[],
  personas?: string,
  game?: string,
): TokenValues {
  const base = characterTokens(character, persona.name, persona.description)
  return {
    ...base,
    ...(cast ? castTokens(cast, persona.name) : {}),
    ...(personas !== undefined ? { personas } : {}),
    ...(game !== undefined ? { game } : {}),
  }
}

/** A block's own input values. Per-block, so it can't ride along in swapTokens' shared table:
 *  {{blockVal}} is the low end of the range and {{blockVal2}} the high end. */
export function swapBlockVals(text: string, input: BlockInput): string {
  return text
    .replaceAll('{{blockVal2}}', String(input.value2 ?? input.value))
    .replaceAll('{{blockVal}}', String(input.value))
}
