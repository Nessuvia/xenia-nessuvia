// Extension-ful imports on purpose: the check scripts run this file's importers under
// `node --experimental-strip-types`. Nothing here may reach the store, for the same reason.
import type { GrammarHammerRule } from '../../hammer/rule.ts'

/**
 * The detector settings, in one place and owned by the pipeline rather than by global settings.
 *
 * Three stage kinds read this same object. The gate counts what the detectors find to decide
 * whether the rest of the pipeline runs, the clean stage turns the findings into notes for its
 * edit request, and the score stage runs the same checks over the original and the rewrite so the
 * two are measured the same way. One copy, so those three can never disagree.
 */
export interface DetectSettings {
  /** POS patterns. `strip` and `replace` edit the text; `flag` only reports. */
  rules: GrammarHammerRule[]
  /** Literal or regex finds, each carrying the instruction its author wrote. */
  textRules: TextRule[]
  punctuation: PunctuationSettings
  repetition: RepetitionSettings
  sprawl: SprawlSettings
  triplet: TripletSettings
}

/**
 * The two mechanical sweeps: em dashes to commas, curly quotes and ellipses to their straight
 * forms. Settings rather than rules because there is no judgment in either one, so there is
 * nothing for the editing model to be told.
 */
export interface PunctuationSettings {
  dashes: boolean
  quotes: boolean
}

/**
 * The tricolon check: sentences built as exactly three comma-separated members.
 *
 * A built-in rather than a rule because the thing that is wrong is a count. There is nothing to
 * match on, which is why the `rule-of-three` note rule keeps failing to stop it.
 */
export interface TripletSettings {
  enabled: boolean
}

/**
 * The sentence-sprawl check: sentences that accrete clauses instead of ending.
 *
 * A built-in for the same reason repetition is one. A rule matches words; this counts joints, and
 * the tell is how many a sentence has rather than which ones they are.
 */
export interface SprawlSettings {
  enabled: boolean
  /** Words in one sentence before it is flagged. */
  maxWords: number
  /** Commas in one sentence. */
  maxCommas: number
  /** Coordinating conjunctions (and, but, so, or, then) in one sentence. */
  maxConjunctions: number
}

/**
 * The repetition check. Not a rule, because it is the one thing a rule cannot express: a Grammar
 * Hammer pattern matches the text in front of it, and this compares the reply against earlier ones.
 */
export interface RepetitionSettings {
  enabled: boolean
  /** Words a shared phrase needs before it counts. Below four, ordinary English ("out of the",
   *  "she looked at") trips constantly and every note is noise. */
  phrase: number
  /** How many earlier messages must carry the phrase. Two means the reply is its third outing. */
  repeats: number
  /** How far back to look. */
  lookback: number
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
  // in a pipeline, either a bundled one or someone else's. See `../pipelineJson.ts`.
  rules: [],
  textRules: [],
  punctuation: { dashes: true, quotes: true },
  repetition: { enabled: true, phrase: 4, repeats: 2, lookback: 8 },
  sprawl: { enabled: true, maxWords: 45, maxCommas: 4, maxConjunctions: 3 },
  triplet: { enabled: true },
}

/** Defaults under a stored blob, nested shapes included. A pipeline written before a field existed
 *  would otherwise resolve it as undefined, and arithmetic on it produces NaN. */
export function resolveDetect(stored?: Partial<DetectSettings>): DetectSettings {
  return {
    ...defaultDetect,
    ...stored,
    punctuation: { ...defaultDetect.punctuation, ...stored?.punctuation },
    repetition: { ...defaultDetect.repetition, ...stored?.repetition },
    sprawl: { ...defaultDetect.sprawl, ...stored?.sprawl },
    triplet: { ...defaultDetect.triplet, ...stored?.triplet },
  }
}
