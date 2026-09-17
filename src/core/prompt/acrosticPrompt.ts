// Extension-ful imports on purpose: checkAcrosticPrompt.ts runs this under `node --experimental-strip-types`.
import type { ChatMessage } from '../connectors/connectorInterface'
import type { AcrosticTemplate, Slot } from '../agent/acrostic/draw.ts'

/** A slot's tag as the model writes it: `[1.1|action|M]`, `[1.2|dialogue]`. */
export function slotTag(slot: Slot): string {
  return `[${[slot.id, slot.type, slot.letter].filter(Boolean).join('|')}]`
}

const beatHint = 'introduces a new event, choice, or reveal'

/** The instruction carrying the template. `retryNote` is added on the second attempt. */
export function acrosticInstruction(template: AcrosticTemplate, jsonMode: boolean, retryNote?: string): string {
  const lines = template.paragraphs.flat().map((slot) => (slot.type === 'beat' ? `${slotTag(slot)} ${beatHint}` : slotTag(slot)))
  const head = jsonMode
    ? 'Write your reply as JSON: { "lines": [{ "id": "1.1", "text": "the sentence" }] }, one entry per line below, in order.'
    : 'Write your reply by filling each line. Keep the tag, then the sentence.'
  return [head, ...lines, 'A letter means the sentence starts with that letter.', retryNote].filter(Boolean).join('\n')
}

/**
 * The chat's normal prompt with the acrostic instruction as a final system turn.
 *
 * ponytail: the instruction isn't counted against the token budget, which `buildPrompt` already
 * trimmed history to. It's a few hundred tokens at most; route it through `appendSystem` if a
 * long chat starts overflowing.
 */
export function acrosticMessages(messages: ChatMessage[], template: AcrosticTemplate, jsonMode: boolean, retryNote?: string): ChatMessage[] {
  return [...messages, { role: 'system', content: acrosticInstruction(template, jsonMode, retryNote) }]
}

/** A GBNF string literal. */
const literal = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/**
 * A GBNF grammar for the template: every tag in order, one line each, and a lettered line opening
 * on its letter (past any quote or italic marker). `prefilled` drops the first tag, which a text
 * connection has already written into the prompt; the model may start with the space after it.
 */
export function acrosticGrammar(template: AcrosticTemplate, prefilled: boolean): string {
  const slots = template.paragraphs.flat()
  const lines = slots.map((slot, i) => {
    const tag = i === 0 && prefilled ? '" "? ' : `${literal(`${slotTag(slot)} `)} `
    const body = slot.letter ? `open ${literal(slot.letter)} rest` : 'text'
    return `line${i + 1} ::= ${tag}${body}`
  })
  return [
    `root ::= ${slots.map((_, i) => `line${i + 1}`).join(' "\\n" ')}`,
    ...lines,
    'open ::= ["“*_]*',
    'rest ::= [^\\n]*',
    'text ::= [^\\n]+',
  ].join('\n')
}
