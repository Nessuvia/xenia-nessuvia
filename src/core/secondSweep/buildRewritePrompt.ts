// Extension-ful imports on purpose: checkRewritePrompt.ts runs this under
// `node --experimental-strip-types`.
import type { ChatMessage } from '../connectors/connectorInterface'
import type { Character, Message } from '../storage/types'
import { activeDescription } from '../storage/types.ts'
import { swapTokens } from '../prompt/swapTokens.ts'
import type { Budget } from '../prompt/budget.ts'
import { countMessages, trimHistory } from '../prompt/budget.ts'
import { bannedPromptTurn } from '../quality/bannedStrings.ts'
import type { RewriteStage } from './pipeline.ts'

/**
 * The line that separates the instruction from the passage. Fixed rather than part of the preset:
 * a preset is about voice, and every preset needs the same "here is the text" turn under it.
 */
export const rewriteInstruction = 'Rewrite this passage:'

export interface RewritePromptInput {
  /** Whose card frames the rewrite. Undefined, or `includeCharacter: false`, drops the card turn. */
  character?: Character
  /** The {{user}} name, for token substitution in the preset. */
  userName?: string
  /** The chat up to but not including the message being rewritten, oldest first. */
  messages: Message[]
  /** The text to rewrite: the reply as it stands after the stages before this one. */
  text: string
  config: RewriteStage['config']
  /** Phrases the rewrite must not use: the chat's own overused ones and the slop lexicon. Rendered
   *  as its own system turn, and only when `config.promptBannedList` is on. */
  banned?: string[]
}

/**
 * The slim window, and the whole context decision in one function.
 *
 * **This must not call `buildPrompt`.** Reusing the chat stack is exactly what a rewrite stage is
 * not doing: the point is a small cheap window aimed at a second, usually local, model that supplies
 * voice while the first model supplies comprehension and memory. The card goes in as its
 * description and nothing else, and the history is a fixed count of recent turns rather than a
 * budgeted fill.
 *
 * Returns an empty array when nothing is armed, which is the caller's signal not to send.
 */
export function buildRewritePrompt(input: RewritePromptInput, budget?: Budget): ChatMessage[] {
  const { character, userName = 'User', messages, text, config, banned = [] } = input
  const preset = config.preset.trim()
  if (!preset) return []

  const tokens = { char: character?.name ?? 'the character', user: userName }

  const head: ChatMessage[] = [{ role: 'system', content: swapTokens(preset, tokens) }]
  if (config.includeCharacter && character) {
    const description = swapTokens(activeDescription(character), tokens).trim()
    // Skipped rather than sent as an empty system turn: a card with no description has nothing to
    // say about voice, and a blank turn costs overhead for it.
    if (description) {
      head.push({ role: 'system', content: `${character.name}\n${description}` })
    }
  }

  // Its own turn rather than appended to the preset: the preset is the user's opinion about voice
  // and this is generated per request, so keeping them apart makes both readable in the preview and
  // makes the list trivial to drop.
  if (config.promptBannedList && banned.length) {
    head.push({ role: 'system', content: bannedPromptTurn(banned) })
  }

  const tail: ChatMessage = { role: 'user', content: `${rewriteInstruction}\n\n${text}` }

  const count = Math.max(0, Math.floor(config.historyCount))
  let history = count > 0 ? messages.slice(-count) : []
  // The budget is the rewrite connection's, not the chat's: this window goes to a different
  // model with a context of its own, usually a much smaller one.
  if (budget && history.length) {
    history = trimHistory(history, countMessages([...head, tail]), budget).messages
  }

  return [
    ...head,
    ...history.map((m): ChatMessage => ({ role: m.role, content: m.content })),
    tail,
  ]
}
