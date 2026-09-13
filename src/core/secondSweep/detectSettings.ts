// Extension-ful imports on purpose: the check scripts run this file's importers under
// `node --experimental-strip-types`. Nothing here may reach the store, for the same reason.
import type { Rule } from './rules.ts'
import { mergeRules, looksLegacy } from './mergeRules.ts'

/**
 * The detector settings, in one place and owned by the pipeline rather than by global settings.
 *
 * The gate counts what the detectors find to decide whether the rest of the pipeline runs, and the
 * clean stage turns the same findings into notes for its edit request. One copy, so the two can
 * never disagree about what counts as a problem.
 *
 * Everything here matches text: the rules and the punctuation sweep. The checks that counted
 * instead (sentence sprawl, tricolons, phrases repeated from earlier replies) were deleted.
 * Counting produced a note the model could not act on and a setting nobody tuned; what the chat
 * has actually overused is measured by `quality/census.ts` instead.
 */
export interface DetectSettings {
  /** One list, three match modes. `strip` and `replace` edit the text; `flag` only reports. */
  rules: Rule[]
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

export const defaultDetect: DetectSettings = {
  // Ships empty. Rules are opinions about prose, and the build has none: a set arrives in an
  // imported pipeline, or is built a rule at a time from the Slop-dentifier.
  rules: [],
  punctuation: { dashes: true, quotes: true },
}

/**
 * Defaults under a stored blob, nested shapes included. A pipeline written before a field existed
 * would otherwise resolve it as undefined, and arithmetic on it produces NaN.
 *
 * Also where a pipeline written before the rule merge is converted. `rules` and `textRules` were
 * two lists of two types; they are now one list, and every old rule has an exact equivalent.
 */
export function resolveDetect(stored?: Partial<DetectSettings> & { textRules?: unknown }): DetectSettings {
  const hasOldText = Array.isArray(stored?.textRules) && stored.textRules.length > 0
  const legacy = looksLegacy(stored?.rules) || hasOldText
  // Built field by field rather than spread over the stored blob: a spread would carry `textRules`
  // through onto the resolved object and write it straight back to Dexie on the next save.
  return {
    rules: legacy
      ? mergeRules(stored?.rules, stored?.textRules)
      : (stored?.rules ?? defaultDetect.rules),
    punctuation: { ...defaultDetect.punctuation, ...stored?.punctuation },
  }
}
