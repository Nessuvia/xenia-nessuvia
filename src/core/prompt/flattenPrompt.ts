// Extension-ful imports on purpose: checkFlattenPrompt.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { ChatMessage } from '../connectors/connectorInterface'
import type { InstructTemplate } from '../params/paramDef.ts'
import { stripReasoning } from './reasoning.ts'

/** Whether this history has more than one speaker on the assistant side, for `names: 'group'`. */
function isGroup(messages: ChatMessage[]): boolean {
  const speakers = new Set(
    messages.filter((m) => m.role === 'assistant' && m.name).map((m) => m.name),
  )
  return speakers.size > 1
}

/**
 * `{{char}}` and `{{user}}` inside a sequence, filled from whoever last spoke in each role. Only
 * those two: a sequence is a handful of tokens wrapping a turn, not a place to paste a description.
 */
function expand(text: string, char: string, user: string): string {
  return text.replace(/\{\{(char|user)\}\}/gi, (_, token: string) =>
    token.toLowerCase() === 'char' ? char : user,
  )
}

/** Every sequence in a template, for `sequencesAsStops`. */
export function sequencesOf(template: InstructTemplate): string[] {
  return [
    template.systemPrefix,
    template.systemSuffix,
    template.userPrefix,
    template.userSuffix,
    template.modelPrefix,
    template.modelSuffix,
    template.firstModelPrefix ?? '',
    template.lastModelPrefix ?? '',
  ].filter((s) => s.trim().length > 0)
}

/**
 * A message list as one string, for a text-completion endpoint. Each message is wrapped in its
 * role's prefix and suffix; `firstPrefix` (the BOS token) is emitted once at the very front, and
 * the assistant turn is left open at the end so the model continues rather than starts over.
 *
 * The message contents are never rewritten, only wrapped and optionally labelled with a speaker.
 * Formatting is a transport concern here the same way it is a display concern elsewhere. The one
 * exception is a past think block, which is dropped when the template says not to send it back:
 * that is removing text the model wrote about itself, not reformatting what it said.
 */
export function flattenPrompt(messages: ChatMessage[], template: InstructTemplate): string {
  const char = [...messages].reverse().find((m) => m.role === 'assistant' && m.name)?.name ?? ''
  const user = [...messages].reverse().find((m) => m.role === 'user' && m.name)?.name ?? ''
  const macro = template.expandMacros === false ? (s: string) => s : (s: string) => expand(s, char, user)
  const seq = (s: string | undefined) => macro(s ?? '')

  const group = isGroup(messages)
  const labelled = template.names === 'always' || (template.names === 'group' && group)
  const lastAssistant = messages.map((m) => m.role).lastIndexOf('assistant')
  const firstAssistant = messages.findIndex((m) => m.role === 'assistant')

  let out = template.firstPrefix ?? ''
  /**
   * Append, keeping a sequence on a line of its own when the template asks for it. Alpaca's
   * `### Instruction:` needs a blank line either side of it and has no closing sequence at all;
   * ChatML writes its own newlines and must not get more. Hence a flag rather than a rule.
   */
  const add = (text: string, isSequence = false) => {
    if (!text) return
    if (!template.wrapNewlines) {
      out += text
      return
    }
    if (out !== '' && !out.endsWith('\n')) out += '\n'
    out += isSequence ? `${text.replace(/\n+$/, '')}\n` : text
  }

  messages.forEach((message, idx) => {
    const asUser = message.role === 'system' && template.systemAsUser
    const role = asUser ? 'user' : message.role

    let prefix: string
    let suffix: string
    if (role === 'system') {
      prefix = seq(template.systemPrefix)
      suffix = seq(template.systemSuffix)
    } else if (role === 'assistant') {
      // The first and last assistant turns may open differently. When both apply to one turn, last
      // wins: it is the one a "stay in character" nudge is written for.
      const override =
        idx === lastAssistant
          ? template.lastModelPrefix
          : idx === firstAssistant
            ? template.firstModelPrefix
            : undefined
      prefix = seq(override || template.modelPrefix)
      suffix = seq(template.modelSuffix)
    } else {
      prefix = seq(template.userPrefix)
      suffix = seq(template.userSuffix)
    }

    let content = message.content
    if (message.role === 'assistant' && template.reasoning) {
      content = stripReasoning(content, template.reasoning, messages.length - idx)
    }
    // A group chat already carries the speaker inline (see buildPrompt), so labelling again would
    // read "Alice: Alice: ...". The guard is what lets both paths coexist.
    if (labelled && message.name && !content.startsWith(`${message.name}:`)) {
      content = `${message.name}: ${content}`
    }
    add(prefix, true)
    add(content)
    add(suffix, true)
  })

  // The open assistant turn. Without it the model has to guess whose line is next. It stays open,
  // so the trailing newline `add` would give a wrapped sequence is exactly what the model needs.
  add(seq(template.lastModelPrefix || template.modelPrefix), true)
  // A label on the open turn names who must answer, which is the whole point in a group chat.
  if (labelled && char) out += `${char}: `
  // Text the reply has to begin with. Written into the prompt, so the model continues it rather
  // than deciding whether to use it.
  if (template.prefill) out += macro(template.prefill)
  // A trailing space after the prefix costs a token on most tokenizers and shifts the reply.
  return template.trimTrailingSpace ? out.replace(/[ \t]+$/, '') : out
}
