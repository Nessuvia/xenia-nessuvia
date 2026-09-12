// Extension-ful imports on purpose: checkReasoning.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { ReasoningConfig } from '../params/paramDef.ts'

/** Where a think block sits in a reply: `start` is the first character of the opening marker and
 *  `end` the character after the closing one. `text.slice(end)` is the reply proper. */
export interface ReasoningSpan {
  start: number
  end: number
}

/**
 * The think block in a reply, or null when there isn't one.
 *
 * Only a block at the very front counts. A model writes its thinking before it answers: a
 * `<think>` appearing later is the model quoting the marker inside its reply, and cutting there
 * would eat the answer. Leading whitespace before the marker is allowed and nothing else is.
 *
 * An unclosed block counts and runs to the end of the text. That is the truncated case, where the
 * reply is all thinking and no answer, and treating it as "no reasoning at all" would show the
 * user raw thinking as though the model had meant it.
 */
export function reasoningSpan(text: string, config: ReasoningConfig): ReasoningSpan | null {
  if (!config.prefix) return null
  const start = text.indexOf(config.prefix)
  if (start === -1 || text.slice(0, start).trim() !== '') return null
  const bodyFrom = start + config.prefix.length
  if (!config.suffix) return { start, end: text.length }
  const close = text.indexOf(config.suffix, bodyFrom)
  return close === -1
    ? { start, end: text.length }
    : { start, end: close + config.suffix.length }
}

/** The reply with its think block removed, markers and all. Unchanged when there is no block. */
export function withoutReasoning(text: string, config: ReasoningConfig): string {
  const span = reasoningSpan(text, config)
  if (!span) return text
  return (text.slice(0, span.start) + text.slice(span.end)).replace(/^\s+/, '')
}

/**
 * A stored reply as it should go back into a later prompt. `distance` is how far back the turn is,
 * newest being 1: `maxSendBack` can keep the last turn's thinking and drop the rest. Past
 * thinking is expensive and models rarely need their own. `sendBack` is off by
 * default. It is a send-time choice and the stored text is left whole either way.
 */
export function stripReasoning(text: string, config: ReasoningConfig, distance: number): string {
  if (!config.sendBack) return withoutReasoning(text, config)
  if (config.maxSendBack !== undefined && distance > config.maxSendBack) {
    return withoutReasoning(text, config)
  }
  return text
}
