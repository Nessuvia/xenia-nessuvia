// Ask on the stack editor's template tab. Extension-ful imports on purpose: checkTemplatePrompt.ts
// runs this under `node --experimental-strip-types`.
//
// Unlike the Look ask, this sends the whole template. That's the point of it. The template goes in
// a tagged block inside the last user message, and the system prompt says it's data, so a stack
// full of roleplay instructions doesn't turn the model into the character.
import type { ChatMessage } from '../../core/connectors/connectorInterface.ts'

export interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

/** System prompt, the earlier turns, then the current template and the new question. */
export function buildTemplateMessages(system: string, history: HistoryTurn[], text: string, template: string): ChatMessage[] {
  return [
    { role: 'system', content: system },
    ...history.map((t) => ({ role: t.role, content: t.content })),
    {
      role: 'user',
      content: `<template_under_review>\n${template}\n</template_under_review>\n\n${text}`,
    },
  ]
}

/** Splits a reply into its prose and the last ```template block, if any. */
export function parseTemplateReply(reply: string): { text: string; template?: string } {
  const blocks = [...reply.matchAll(/```template[ \t]*\r?\n([\s\S]*?)\r?\n?```/g)]
  const last = blocks.at(-1)
  if (!last) return { text: reply.trim() }
  return { text: reply.replace(last[0], '').trim(), template: last[1] }
}
