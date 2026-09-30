// SillyTavern's prompt converters, for endpoints that restrict message shape. Chat connections
// only: text connections flatten anyway and Anthropic already lifts system turns out.
//
// Extension-ful imports on purpose: checkPromptProcessing runs this under
// `node --experimental-strip-types`.
import type { ChatMessage } from './connectorInterface.ts'

export type PromptProcessing = 'none' | 'merge' | 'semiStrict' | 'strict' | 'single'
/** How each part is labelled when `single` folds everything into one user message. */
export type SingleLabels = 'name' | 'role' | 'none'

export const promptProcessingOptions: [PromptProcessing, string][] = [
  ['none', 'None'],
  ['merge', 'Merge consecutive roles'],
  ['semiStrict', 'Semi-strict'],
  ['strict', 'Strict'],
  ['single', 'Single user message'],
]

export const singleLabelOptions: [SingleLabels, string][] = [
  ['name', 'Speaker name'],
  ['role', 'Role'],
  ['none', 'None'],
]

/** Joins neighbours with the same role. Names drop on a join: the merged turn has no one speaker. */
function merge(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = []
  for (const m of messages) {
    const last = out.at(-1)
    if (last && last.role === m.role) {
      out[out.length - 1] = { role: last.role, content: `${last.content}\n\n${m.content}` }
    } else {
      out.push({ ...m })
    }
  }
  return out
}

function label(m: ChatMessage, labels: SingleLabels): string {
  if (labels === 'none') return m.content
  const who = labels === 'name' ? (m.name ?? m.role) : m.role
  return `${who}: ${m.content}`
}

export function processMessages(
  messages: ChatMessage[],
  mode: PromptProcessing = 'none',
  placeholder = '',
  labels: SingleLabels = 'name',
): ChatMessage[] {
  if (mode === 'none') return messages
  if (mode === 'single') {
    return [{ role: 'user', content: messages.map((m) => label(m, labels)).join('\n\n') }]
  }
  if (mode === 'merge') return merge(messages)
  // Semi-strict: one optional system message, and only at the very front.
  let out = merge(messages).map((m, i) => (m.role === 'system' && i > 0 ? { ...m, role: 'user' as const } : m))
  out = merge(out)
  if (mode === 'strict') {
    const firstUser = out.findIndex((m) => m.role === 'user')
    const firstAssistant = out.findIndex((m) => m.role === 'assistant')
    if (firstAssistant !== -1 && (firstUser === -1 || firstUser > firstAssistant)) {
      const at = out[0]?.role === 'system' ? 1 : 0
      out.splice(at, 0, { role: 'user', content: placeholder })
    }
  }
  return out
}
