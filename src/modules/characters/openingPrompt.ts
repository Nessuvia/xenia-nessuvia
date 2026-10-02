// Ask on the character editor: write a new opening through the Chat default stack. Extension-ful
// imports on purpose: checkOpeningPrompt.ts runs this under `node --experimental-strip-types`.
//
// The request goes in as the last user turn of an otherwise empty chat, so the stack, the card and
// the lorebooks shape the reply exactly as they would a first reply. Earlier openings from the same
// thread sit in history as assistant turns, which is what lets "make it shorter" revise one.
import type { Message } from '../../core/storage/types.ts'
import type { ReasoningConfig } from '../../core/params/paramDef.ts'
import { withoutReasoning } from '../../core/prompt/reasoning.ts'

export interface OpeningTurn {
  role: 'user' | 'assistant'
  content: string
  /** The opening an assistant turn produced, raw. Sent back in place of the bubble's text. */
  preview?: string
}

/** The persona for the prompt. Its name is the macro itself, so the model sees {{user}} and keeps it. */
export const macroPersonaName = '{{user}}'

/** History for buildPrompt: the instruction leads the thread's first request, follow-ups go as typed. */
export function openingMessages(instruction: string, history: OpeningTurn[], text: string): Message[] {
  const turns = [...history, { role: 'user' as const, content: text }]
  return turns.map((t, i) => ({
    ownerId: 'local',
    chatId: 0,
    role: t.role,
    content: t.role === 'assistant' ? (t.preview ?? t.content) : i === 0 ? `${instruction}\n\n${t.content}` : t.content,
    createdAt: 0,
  }))
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The reply as a greeting: think block dropped, the character's name put back as {{char}}. */
export function parseOpening(reply: string, charName: string, reasoning?: ReasoningConfig): string {
  let text = reasoning ? withoutReasoning(reply, reasoning) : reply
  text = text.trim()
  const name = charName.trim()
  if (!name) return text
  // Lookarounds rather than \b: a name ending in a symbol has no word boundary after it.
  // whole-name matches only. A first name alone ("Jo" for "Jo March") stays as written.
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(name)}(?![\\p{L}\\p{N}_])`, 'gu')
  return text.replace(pattern, '{{char}}')
}
