import type { ChatMessage, StreamChunk } from '../connectors/connectorInterface'
import type { Connection } from '../stores/settingsStore'
import { resolveConnection, secondPassSettings } from '../stores/settingsStore'
import { sendMessage } from '../connectors/openaiCompatible'
import { isSentinel } from '../connectors/sentinel'
import { withParam, maxTokensOf } from '../params/connectionParams'
import { findFlags, stripText } from '../hammer/strip'
import type { Note } from './note'
import { findRepetition } from './repetition'
import { findSprawl } from './sprawl'
import { findTriplets } from './triplet'
import { findTextMatches, standingNotes } from './textRules'
import { buildPassPrompt, shouldRunPass } from './buildPassPrompt'
import { normalizePunctuation, punctuationStream } from './punctuation'
import type { PassContext } from './passContext'

export type { PassContext }

/**
 * The generation seam for prose. Same signature as `sendMessage`, so a call site keeps its
 * `for await` loop: draft text arrives on `chunk.draft` and the reply still arrives on
 * `chunk.content`, exactly as before.
 *
 * With Second Pass on, the first reply streams out as draft, the Grammar Hammer's `strip` and
 * `replace` rules clean it, the `flag` rules, the free-text rules and the repetition check report
 * on what is left, and those notes drive a second
 * request whose text becomes the reply. Nothing flagged means no second request: the cleaned draft
 * is the reply and only one call was ever made.
 *
 * Prose call sites only. `generatePalette` and the Write outline generators ask for JSON through
 * `response_format`, and an editor told to fix prose would corrupt the object.
 */
export async function* runSecondPass(
  messages: ChatMessage[],
  connection: Connection,
  signal?: AbortSignal,
  extra?: Record<string, unknown>,
  context: PassContext = {},
): AsyncGenerator<StreamChunk> {
  const settings = secondPassSettings()
  // The sentinel's replies are fixed strings, not model output, and there is nothing behind the
  // endpoint to edit them with. Passing them through would break twice over: the strip rules would
  // cut up copy that is written the way it is on purpose, and the editing pass would make a second
  // "request" that comes back as a different line, so the reply the user read would be replaced by
  // an unrelated one mid-stream. Checked here rather than in the hammer, which is working exactly
  // as intended on text that simply should not be given to it.
  if (!settings.enabled || isSentinel(connection.endpointUrl)) {
    yield* sendMessage(messages, connection, signal, extra)
    return
  }

  // Pass one, buffered but not hidden: the draft streams so the wait looks like a wait rather than
  // a hang, and the caller renders it provisionally.
  let draft = ''
  let finishReason = ''
  for await (const chunk of sendMessage(messages, connection, signal, extra)) {
    if (chunk.content) {
      draft += chunk.content
      yield { draft: chunk.content }
    }
    // Reasoning belongs to the writing model and is displayed the same way either pass.
    if (chunk.reasoning) yield { reasoning: chunk.reasoning }
    if (chunk.finishReason) finishReason = chunk.finishReason
  }

  // An empty or aborted first pass has nothing to edit. Report it exactly as a single-pass send
  // would, so the caller's existing empty-reply and abort handling still fires.
  if (!draft || signal?.aborted) {
    yield { content: draft, finishReason }
    return
  }

  yield* editPass(draft, signal, context, finishReason)
}

/**
 * The editing half on its own: take text that already exists, check it, and stream the edited
 * version. `runSecondPass` is this with a generation in front of it.
 *
 * Split out for the Write outline generators, which have prose to clean (beats, chapter summaries)
 * but arrive at it by parsing JSON rather than by streaming, so there is no first pass to wrap.
 *
 * `finishReason` is pass one's, carried through so a caller still learns its reply was truncated.
 */
export async function* editPass(
  draft: string,
  signal?: AbortSignal,
  context: PassContext = {},
  finishReason = '',
): AsyncGenerator<StreamChunk> {
  const settings = secondPassSettings()
  const role = context.role ?? 'assistant'

  // The mechanical edits first, so the checks and the model both see the cleaned text. Showing
  // the model the original slop would ask it to redo work `repairAll` already did correctly, and
  // putting the bad phrasing in front of it is a good way to get the bad phrasing back.
  const cleaned = normalizePunctuation(stripText(draft, settings.rules, role).text, settings.punctuation)

  const notes: Note[] = findFlags(cleaned, settings.rules, role).map((flag) => ({
    source: `hammer:${flag.rule.label || flag.rule.id}`,
    span: { start: flag.start, end: flag.end },
    slice: flag.slice,
    message: `Matches the "${flag.rule.label || flag.rule.pattern}" pattern, which looks like filler. Rewrite it or cut it, whichever keeps the meaning.`,
  }))
  notes.push(...findTextMatches(cleaned, settings.textRules, role))
  notes.push(...findRepetition(cleaned, context.history ?? [], settings.repetition))
  notes.push(...findSprawl(cleaned, settings.sprawl))
  notes.push(...findTriplets(cleaned, settings.triplet))

  const standing = standingNotes(settings.textRules, role)

  if (!shouldRunPass(notes, settings.userPrompt, settings.skipWhenClean, standing)) {
    // The cleaned draft is the reply. One request was made, and the caller stores what the strip
    // rules produced rather than what the model first said.
    yield { content: cleaned, finishReason }
    return
  }

  const editor = resolveConnection(settings.connectionId)
  // The sentinel counts as no connection: it would answer the edit request with its own next line,
  // which would then be stored as the reply. A real draft is worth more unedited than replaced.
  if (!editor || isSentinel(editor.endpointUrl)) {
    // No connection to edit with. The draft is a real reply and losing it to a settings problem
    // would be worse than shipping it unedited.
    yield { content: cleaned, finishReason }
    return
  }

  // The edit reproduces the whole passage, so it needs room for at least what pass one produced.
  // Same widening `generatePalette` and the outline generators do, for the same reason.
  const wide = withParam(editor, 'max_tokens', Math.max(maxTokensOf(editor), estimateTokens(cleaned)))

  // The edited text gets the punctuation sweep too. The model is told not to write em dashes and
  // writes them anyway, both by missing one and by introducing a fresh one while fixing something
  // else, and this is the last look anything takes at the text.
  const sweep = punctuationStream(settings.punctuation)

  let edited = ''
  let editFinish = ''
  try {
    for await (const chunk of sendMessage(buildPassPrompt(cleaned, notes, settings.userPrompt, standing), wide, signal)) {
      if (chunk.content) {
        edited += chunk.content
        const out = sweep.push(chunk.content)
        if (out) yield { content: out }
      }
      if (chunk.finishReason) editFinish = chunk.finishReason
    }
    const tail = sweep.flush()
    if (tail) yield { content: tail }
  } catch (err) {
    if (signal?.aborted) throw err
    // The editing pass failed but the draft is intact. Emitting it keeps the generation rather than
    // losing a good reply to a second request that need not have been made.
    if (!edited) {
      yield { content: cleaned, finishReason }
      return
    }
    throw err
  }

  // A pass that produced nothing falls back the same way.
  if (!edited) yield { content: cleaned, finishReason }
  else if (editFinish) yield { finishReason: editFinish }
}

/** Rough token count for sizing the edit's budget. Four characters per token is the usual English
 *  approximation, and this only has to be big enough, never exact. The real tokenizer in
 *  `core/prompt/budget` is for counting what is sent, not for padding a limit. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4) + 200
}
