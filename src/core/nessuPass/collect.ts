// Extension-ful imports on purpose: checkCollect.ts runs this under
// `node --experimental-strip-types`. Nothing here may reach the store.
import { findFlags, stripText } from '../hammer/strip.ts'
import type { Note } from './note.ts'
import type { PassContext } from './passContext.ts'
import type { DetectSettings } from './detectSettings.ts'
import { normalizePunctuation } from './punctuation.ts'
import { findTextMatches, standingNotes } from './textRules.ts'

/** What the detectors made of a passage: the text after the mechanical edits, what is still wrong
 *  with it, and the rules that apply to every passage regardless. */
export interface Findings {
  /** The passage after `strip`/`replace` and the punctuation sweep. No request was made for it. */
  cleaned: string
  /** Whether those mechanical edits changed anything. */
  edited: boolean
  /** Problems found in this passage, each quoting the slice it is about. */
  notes: Note[]
  /** Always-on rules: true of every passage rather than found in this one. */
  standing: Note[]
}

/**
 * Run every detector once.
 *
 * Called once per pipeline run and shared by the gate and the clean stage, so the gate can never
 * decide on a different set of findings than the stage it gates. The score stage does not read
 * this: it measures two passages against each other rather than reading one.
 *
 * The mechanical edits come first so both the checks and the model see the cleaned text. Showing
 * the model the original slop would ask it to redo work `repairAll` already did correctly, and
 * putting the bad phrasing in front of it is a good way to get the bad phrasing back.
 */
export function collectFindings(
  text: string,
  detect: DetectSettings,
  context: PassContext = {},
): Findings {
  const role = context.role ?? 'assistant'
  const cleaned = normalizePunctuation(
    stripText(text, detect.rules, role).text,
    detect.punctuation,
  )

  const notes: Note[] = findFlags(cleaned, detect.rules, role).map((flag) => ({
    source: `hammer:${flag.rule.label || flag.rule.id}`,
    span: { start: flag.start, end: flag.end },
    slice: flag.slice,
    message: `Matches the "${flag.rule.label || flag.rule.pattern}" pattern, which looks like filler. Rewrite it or cut it, whichever keeps the meaning.`,
  }))
  notes.push(...findTextMatches(cleaned, detect.textRules, role))

  return { cleaned, edited: cleaned !== text, notes, standing: standingNotes(detect.textRules, role) }
}
