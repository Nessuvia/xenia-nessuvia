import { maxTokensOf, withParam } from '../params/connectionParams'
import { sendMessage } from '../connectors/openaiCompatible'
import type { Connection } from '../stores/settingsStore'
import type { Palette } from './palette'
import type { StructuredMode } from './palettePrompt'
import {
  buildPaletteMessages,
  modeLadder,
  parsePaletteReply,
  responseFormat,
} from './palettePrompt'

export interface GeneratedPalette {
  palette: Palette
  /** The rung that worked. The caller stores it on the connection so the next ask starts here. */
  mode: StructuredMode
}

/** Everything the endpoint actually sent, for the panel to show under a failure. Reading it is how
 *  you tell a refusal from a truncation from a model that answered in prose. */
export interface PaletteAttempt {
  mode: StructuredMode
  reply: string
  reasoning: string
  finishReason: string
}

/** A failed generate, with the transcript attached. Not a subclass: the callers read `.attempt`
 *  off whatever they caught rather than testing a type. */
export interface PaletteError extends Error {
  attempt?: PaletteAttempt
}

/**
 * One palette from the active connection. Goes through the same `sendMessage` every reply in the
 * app comes from; the difference is that the stream is collected into a string rather than rendered
 * as it arrives, and that the request asks for JSON back.
 *
 * Structured output is not configured, it is discovered: the request asks for a JSON schema, and
 * an endpoint that refuses gets asked again one rung lower. `connection.structuredOutput` is where
 * the answer is remembered. The walk down happens once per connection rather than once per ask.
 */
export async function generatePalette(
  prompt: string,
  ask: string,
  palette: Palette,
  connection: Connection,
  signal?: AbortSignal,
): Promise<GeneratedPalette> {
  const messages = buildPaletteMessages(prompt, ask, palette)
  // A full palette object runs past the 512-token default, and a truncated object parses as
  // nothing at all. This one request gets its own floor rather than the connection's limit.
  const wide = withParam(connection, 'max_tokens', Math.max(maxTokensOf(connection), 1500))
  const rungs = modeLadder(connection.structuredOutput)
  let lastError: PaletteError | undefined

  for (const mode of rungs) {
    const attempt: PaletteAttempt = { mode, reply: '', reasoning: '', finishReason: '' }
    try {
      for await (const chunk of sendMessage(messages, wide, signal, responseFormat(mode))) {
        if (chunk.content) attempt.reply += chunk.content
        if (chunk.reasoning) attempt.reasoning += chunk.reasoning
        if (chunk.finishReason) attempt.finishReason = chunk.finishReason
      }
      return { palette: parsePaletteReply(attempt.reply, palette), mode }
    } catch (err) {
      lastError = err as PaletteError
      lastError.message = explain(lastError, attempt, maxTokensOf(wide))
      lastError.attempt = attempt
      // Only a refusal of the request itself is worth retrying lower. A 5xx, a dropped connection
      // or an unparseable reply all mean the next rung would fail the same way.
      const status = (err as { status?: number }).status
      if (status === undefined || status < 400 || status >= 500) throw lastError
    }
  }

  throw lastError ?? new Error('The request was not sent.')
}

/**
 * The message the panel shows. The parse errors say what was wrong with the text; this adds the
 * cases where there was no text to be wrong: an empty reply looks like "held no palette" otherwise,
 * which points at the parser instead of at the token budget or the endpoint.
 */
function explain(err: Error, attempt: PaletteAttempt, maxTokens: number): string {
  const cap = `The limit for this request was ${maxTokens} tokens.`
  if (!attempt.reply.trim()) {
    if (attempt.finishReason === 'length' && attempt.reasoning) {
      return `The model spent the whole token budget reasoning and never wrote a reply. ${cap}`
    }
    if (attempt.reasoning) return 'The model returned reasoning and no reply.'
    if (attempt.finishReason === 'content_filter') return 'The endpoint filtered the reply.'
    return `The endpoint returned an empty reply${attempt.finishReason ? ` (finish_reason: ${attempt.finishReason})` : ''}.`
  }
  if (attempt.finishReason === 'length') {
    return `The reply was cut off at the token limit before the JSON ended. ${cap}`
  }
  return err.message
}
