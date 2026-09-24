// Extension-ful imports on purpose: checkPrefill.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { InstructTemplate } from '../params/paramDef.ts'

/**
 * Text the reply is forced to begin with. One reader for both endpoint kinds: a text connection
 * writes it into the flattened prompt after the open model prefix, a chat connection sends it as a
 * trailing assistant turn. Either way the model continues it rather than repeating it, so the
 * string comes back out of the stream missing and has to be prepended again.
 *
 * Empty means no prefill at all rather than a blank assistant turn. `prefillEnabled` unset counts
 * as on: a template that carries a prefill was written before the toggle existed and meant it.
 */
export function prefillOf(template: InstructTemplate | undefined): string {
  if (!template || template.prefillEnabled === false) return ''
  return template.prefill ?? ''
}

/**
 * The chat-completions fields that tell a backend the last assistant turn is an opening rather
 * than a finished message. vLLM and its lookalikes need both; OpenAI proper rejects unknown body
 * fields, so this is off unless the connection asks for it.
 */
export function continueFields(template: InstructTemplate | undefined): Record<string, unknown> {
  if (!template?.prefillContinue) return {}
  return { continue_final_message: true, add_generation_prompt: false }
}

/**
 * Whether a failed request failed because the backend won't take a trailing assistant turn.
 * Matched on the message because that's all an OpenAI-compatible error gives: the status is 400
 * and the body is the backend's own prose. Broad on purpose. The cost of a false positive is one
 * reply generated without its prefill.
 */
export function rejectsPrefill(message: string): boolean {
  const text = message.toLowerCase()
  if (!/assistant|prefill|final message|continue_final_message|add_generation_prompt/.test(text)) {
    return false
  }
  return /last|final|end|trailing|must|cannot|can't|not allowed|unsupported|invalid|unrecognized/.test(text)
}

/** Endpoints that have refused a prefill this session. Cleared by a reload, which is right: the
 *  user may have pointed the connection at another backend. */
const refused = new Set<string>()

/** True once the endpoint has refused. The warning is printed on the first refusal only. */
export function skipsPrefill(endpointUrl: string): boolean {
  return refused.has(endpointUrl)
}

export function markRefusedPrefill(endpointUrl: string, reason: string): void {
  if (refused.has(endpointUrl)) return
  refused.add(endpointUrl)
  console.warn(`Prefill turned off for ${endpointUrl}: the backend rejected a trailing assistant message. ${reason}`)
}

/** Test seam. Nothing in the app calls this. */
export function forgetRefusedPrefill(): void {
  refused.clear()
}
