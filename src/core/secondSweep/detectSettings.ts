// Extension-ful imports on purpose: the check scripts run this file's importers under
// `node --experimental-strip-types`. Nothing here may reach the store, for the same reason.
import type { GrammarHammerRule } from '../hammer/rule.ts'

/**
 * The detector settings, in one place and owned by the pipeline rather than by global settings.
 *
 * The gate counts what the detectors find to decide whether the rest of the pipeline runs, and the
 * clean stage turns the same findings into notes for its edit request. One copy, so the two can
 * never disagree about what counts as a problem.
 *
 * Everything here matches text: hammer patterns, free-text rules, and the punctuation sweep. The
 * checks that counted instead (sentence sprawl, tricolons, phrases repeated from earlier replies)
 * were deleted. Counting produced a note the model could not act on and a setting nobody tuned;
 * what the chat has actually overused is measured by `quality/census.ts` instead.
 */
export interface DetectSettings {
  /** POS patterns. `strip` and `replace` edit the text; `flag` only reports. */
  rules: GrammarHammerRule[]
  /** Literal or regex finds, each carrying the instruction its author wrote. */
  textRules: TextRule[]
  punctuation: PunctuationSettings
}

/**
 * The two mechanical sweeps: em dashes to commas, curly quotes and ellipses to their straight
 * forms. Settings rather than rules: there is no judgment in either one, and nothing for the
 * editing model to be told.
 */
export interface PunctuationSettings {
  dashes: boolean
  quotes: boolean
}

/**
 * A free-text check, authored in the pipeline rather than in the Grammar Hammer.
 *
 * The Hammer matches parts of speech and can edit the text; these match words the way Find &
 * Replace does, and only ever report. Two reasons they live apart rather than as another Hammer
 * action: a literal find needs no POS tagging and no cheat sheet, and a Hammer rule can strip or
 * replace while this one has nothing to strip with. What it has instead is `note`, the instruction
 * handed to the model in the author's own words.
 */
export interface TextRule {
  id: string
  enabled: boolean
  label?: string
  /**
   * What to look for. A literal string unless `regex`, in which case a raw JS pattern.
   *
   * **Blank means the rule always applies.** Most of what makes prose bad is a judgment rather
   * than a string: "no sentence whose only content is naming an emotion" has nothing to match on.
   * Those rules carry their instruction and no find, and go to the model on every pass.
   */
  find: string
  regex: boolean
  caseSensitive: boolean
  scope: 'assistant' | 'user' | 'both'
  /** What the model is told. Blank falls back to a generic line naming the match; a rule with no
   *  find and no note has nothing to say and is skipped. */
  note: string
}

export function newTextRule(): TextRule {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    find: '',
    regex: false,
    caseSensitive: false,
    scope: 'assistant',
    note: '',
  }
}

export const defaultDetect: DetectSettings = {
  // Both lists ship empty. Rules are opinions about prose, and the build has none: a set arrives
  // in an imported pipeline, or is built a rule at a time from the Slop-dentifier.
  rules: [],
  textRules: [],
  punctuation: { dashes: true, quotes: true },
}

/** Defaults under a stored blob, nested shapes included. A pipeline written before a field existed
 *  would otherwise resolve it as undefined, and arithmetic on it produces NaN. */
export function resolveDetect(stored?: Partial<DetectSettings>): DetectSettings {
  return {
    ...defaultDetect,
    ...stored,
    punctuation: { ...defaultDetect.punctuation, ...stored?.punctuation },
  }
}
