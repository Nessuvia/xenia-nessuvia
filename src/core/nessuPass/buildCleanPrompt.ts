// Extension-ful imports on purpose: checkPassPrompt.ts runs this under `node --experimental-strip-types`.
import type { Note } from './note.ts'

/** Kept structural rather than importing `ChatMessage`, so the check script does not pull the
 *  connector in behind it. Same shape. */
interface PromptMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const SYSTEM = [
  'You are editing a passage from a story. You are given the passage and a numbered list of specific problems in it.',
  '',
  'Return the complete passage with those problems fixed and nothing else changed. Every sentence that is not named in the list must come back byte-identical, including its wording, punctuation and line breaks.',
  '',
  'Keep the voice, tense and point of view exactly as they are. Do not smooth the prose, do not add or remove events, and do not add commentary about what you changed. Return only the passage.',
].join('\n')

/** One note as the model reads it: what is wrong, and the exact text it is about. */
function renderNote(note: Note, index: number): string {
  const lines = [`${index + 1}. ${note.message}`]
  // The quoted slice is what makes this a targeted edit rather than a rewrite: the model is told
  // which characters to touch, not just what is wrong somewhere in the passage.
  if (note.slice?.trim()) lines.push(`   Text: ${JSON.stringify(note.slice)}`)
  if (note.fix) lines.push(`   Suggested: ${JSON.stringify(note.fix)}`)
  return lines.join('\n')
}

/**
 * The second request. The passage goes last so it is the freshest thing in the context, and the
 * notes come first so they read as the task rather than as trailing commentary.
 *
 * The reply has to be the finished passage, not a patch: it streams straight through to the caller
 * as the assistant's text. A structured patch would have to be buffered and applied, which is the
 * one thing that would cost the feature its streaming.
 */
export function buildPassPrompt(
  text: string,
  notes: Note[],
  userPrompt?: string,
  /** Always-on rules, true of every passage rather than found in this one. */
  standing: Note[] = [],
): PromptMessage[] {
  const parts: string[] = []

  // Standing rules first: they are how the prose should read, and the found problems are specific
  // failures against that. The other order looks like a list of fixes with a style guide appended.
  if (standing.length) {
    parts.push('Rules for the passage:', '', standing.map((n, i) => `${i + 1}. ${n.message}`).join('\n'))
  }

  if (notes.length) {
    if (standing.length) parts.push('')
    parts.push('Problems found:', '', notes.map(renderNote).join('\n'))
  } else if (!standing.length) {
    // Reached only when the user wrote a standing instruction: with nothing flagged, no rules and
    // no instruction, the caller skips the request entirely.
    parts.push('No specific problems were flagged.')
  }

  const extra = userPrompt?.trim()
  if (extra) parts.push('', 'Also apply this standing instruction:', extra)

  parts.push('', 'Passage:', text)

  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: parts.join('\n') },
  ]
}

/**
 * Whether the editing request is worth making. Nothing flagged, no standing rules and no standing
 * instruction means there is nothing to ask for, and the draft is already the answer.
 *
 * `skipWhenClean` off forces the request through, which is what a user who wants the model to look
 * at every reply is asking for.
 */
export function shouldRunPass(
  notes: Note[],
  userPrompt: string,
  skipWhenClean: boolean,
  standing: Note[] = [],
): boolean {
  if (!skipWhenClean) return true
  // A standing rule forces the request the same way a standing instruction does. Both say "look at
  // every reply", so a clean reply is still one the model has been asked to look at.
  return notes.length > 0 || standing.length > 0 || userPrompt.trim().length > 0
}
