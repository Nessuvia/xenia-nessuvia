// The wording of every re-roll instruction now lives in `miscPrompts.ts`, where a stack can
// override it. What's left here is the shaping each one needs: trimming, the transcript, and the
// rule that says when there's nothing to send at all.
// Extension-ful imports on purpose: checkPrompt.ts runs this under `node --experimental-strip-types`.
import type { Message } from '../storage/types'
import { fillSlots, miscPrompt } from './miscPrompts.ts'
import type { MiscPrompts } from './miscPrompts.ts'

/** What the user's instruction turns into. The original is quoted so the model has something to
 *  work from even when the budget trimmed the message out of history. */
export function rewritePrompt(
  original: string,
  instruction: string,
  prompts?: MiscPrompts,
): string {
  return fillSlots(miscPrompt('rewrite', prompts), {
    reply: original,
    instruction: instruction.trim(),
  })
}

/**
 * What `/continue` sends. The partial reply rides along as a trailing assistant turn for the model
 * to carry on from: this only has to say not to restart it. Endpoints that ignore the prefill
 * are the reason it says so at all.
 */
export function continuePrompt(prompts?: MiscPrompts): string {
  return miscPrompt('continue', prompts)
}

function speaker(message: Message, characterName: string): string {
  return message.role === 'user'
    ? (message.personaName ?? 'User')
    : (message.speakerName ?? characterName)
}

/**
 * The default instruction for re-rolling a message that isn't the last one. Regenerating an old
 * message sends only the history *before* it. Without this the model writes as if the
 * conversation ended there. Quoting what follows is the whole point: it costs tokens and the
 * budget counts them like anything else.
 *
 * `later` empty (the message *is* the last one) returns '', nothing to warn about. That stays a
 * rule here rather than something the wording has to express: an override can't make an
 * instruction appear where there is nothing to instruct about.
 */
export function oldMessageInstruction(
  later: Message[],
  characterName: string,
  prompts?: MiscPrompts,
): string {
  if (!later.length) return ''
  const transcript = later.map((m) => `${speaker(m, characterName)}: ${m.content}`).join('\n\n')
  return fillSlots(miscPrompt('oldMessage', prompts), { transcript })
}
