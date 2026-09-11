import type { StreamChunk } from '../connectors/connectorInterface'
import type { Character, Message } from '../storage/types'
import type { Connection } from '../stores/settingsStore'
import { sendMessage } from '../connectors/openaiCompatible'
import { maxTokensOf, withParam, budgetOf } from '../params/connectionParams'
import { loadTokenizer } from '../prompt/budget'
import { tokenizerFor } from '../prompt/tokenizers'
import { buildGoldPrompt } from './buildGoldPrompt'
import { lengthGuard } from './lengthGuard'
import type { GoldPassSettings } from './goldPassSettings'

/** What the pass decided, returned rather than yielded: the yielded chunks are the rewrite as it
 *  arrives, and only this says whether it may replace the reply. */
export type GoldOutcome = { text: string } | { reason: string }

/**
 * The generation seam for Gold Pass: a second model on a second connection rewrites text the first
 * model already produced. Same generator shape as `runSecondPass`, so a call site keeps its loop.
 *
 * The yielded `content` is provisional. The caller has already shown the first pass and may render
 * the rewrite over it as it streams, which is the intended feel, but what it *stores* comes from
 * the returned outcome: a rewrite that fails the length guard is never yielded as a decision, and
 * the caller puts the original back.
 *
 * Not armed (no preset, no connection) is never reached here: the caller checks before calling, so
 * a settings problem does not get recorded on the message as a failure.
 */
export async function* runGoldPass(
  text: string,
  character: Character | undefined,
  priorMessages: Message[],
  connection: Connection,
  settings: GoldPassSettings,
  userName: string,
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk, GoldOutcome> {
  await loadTokenizer(tokenizerFor(connection))
  const messages = buildGoldPrompt(
    { character, userName, messages: priorMessages, text, settings },
    budgetOf(connection),
  )
  if (!messages.length) return { reason: 'No Gold Pass preset is selected.' }

  // The rewrite reproduces the whole passage, so it needs room for at least what the first pass
  // produced. Same widening Second Pass's edit does, for the same reason.
  const wide = withParam(
    connection,
    'max_tokens',
    Math.max(maxTokensOf(connection), Math.ceil(text.length / 4) + 200),
  )

  let rewrite = ''
  try {
    for await (const chunk of sendMessage(messages, wide, signal)) {
      if (chunk.content) {
        rewrite += chunk.content
        yield { content: chunk.content }
      }
      // The rewriting model's reasoning is not the message's reasoning: the first model's is what
      // the bubble shows, and this one belongs to a request the user did not ask to see.
    }
  } catch (err) {
    // A deliberate stop throws through, same as the normal send path. Anything else is a failed
    // rewrite, and a failed rewrite keeps the reply that already exists.
    if (signal?.aborted) throw err
    return { reason: (err as Error).message }
  }

  const rejected = lengthGuard(text, rewrite, settings)
  return rejected ? { reason: rejected } : { text: rewrite }
}
