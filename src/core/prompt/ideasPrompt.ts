// Extension-ful imports on purpose: checkIdeas.ts runs this under `node --experimental-strip-types`.
import type { ChatMessage } from '../connectors/connectorInterface'
import { taggedLines } from '../agent/acrostic/parse.ts'
import { fillSlots, miscPrompt, type MiscPrompts } from './miscPrompts.ts'

/** The fields the ideas request reads off a message. Structural, so the check needs no storage types. */
export interface IdeaMessage {
  role: string
  content: string
  divider?: boolean
  reasoningEnd?: number
  speakerName?: string
  personaName?: string
}

/** Fallback names for a message that carries none: the chat's character and the active persona. */
export interface IdeaNames {
  char: string
  user: string
}

const nameOf = (m: IdeaMessage, names: IdeaNames) => (m.role === 'assistant' ? m.speakerName || names.char : m.personaName || names.user)

/**
 * The recent conversation as `Name: text`, oldest first: both sides, in the order it happened, so
 * the model can see whose turn it is. The last `size` messages, stopping at a `/break`. Reasoning in
 * front of a reply is cut off.
 */
export function ideasTranscript(messages: IdeaMessage[], names: IdeaNames, size = 10): string {
  const out: string[] = []
  for (let i = messages.length - 1; i >= 0 && out.length < size; i--) {
    const m = messages[i]
    if (m.divider) break
    const text = (m.role === 'assistant' ? m.content.slice(m.reasoningEnd ?? 0) : m.content).trim()
    if (text) out.unshift(`${nameOf(m, names)}: ${text}`)
  }
  return out.join('\n\n')
}

/**
 * The request, in the stack's `ideas` wording. `{{char}}` is whoever replied last, `{{user}}` the
 * persona on the last message you sent, each falling back to `names`.
 */
export function ideasMessages(messages: IdeaMessage[], names: IdeaNames, prompts: MiscPrompts): ChatMessage[] {
  const live = messages.filter((m) => !m.divider)
  const lastUser = live.findLast((m) => m.role === 'user')
  const lastReply = live.findLast((m) => m.role === 'assistant')
  const user = lastUser ? nameOf(lastUser, names) : names.user
  const char = lastReply ? nameOf(lastReply, names) : names.char
  const message = lastUser?.content.trim() ? `\nLast message from ${user}:\n${lastUser.content.trim()}\n` : ''
  return [
    {
      role: 'user',
      content: fillSlots(miscPrompt('ideas', prompts), { replies: ideasTranscript(messages, names), message, char, user }),
    },
  ]
}

/** Up to three ideas from tagged lines, in the order they came. Surrounding quotes are dropped. */
export function parseIdeas(reply: string): string[] {
  return [...taggedLines(reply).values()]
    .map((line) => line.replace(/^["“]+|["”]+$/g, '').trim())
    .filter(Boolean)
    .slice(0, 3)
}

/** What a picked idea adds to the send it rides on, in the stack's `ideaNext` wording. */
export function ideaInstruction(idea: string, prompts: MiscPrompts): string {
  return fillSlots(miscPrompt('ideaNext', prompts), { idea })
}
