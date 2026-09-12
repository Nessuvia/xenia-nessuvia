// Extension-ful imports on purpose: checkAnalyse.ts runs `ruleFromFinding` under
// `node --experimental-strip-types`. The storage half lives in the component, not here.
import type { TextRule } from '../../core/secondSweep/detectSettings.ts'
import type { Finding } from './analyse.ts'

/** Label length. Long enough to recognise the phrase in a rules list, short enough to fit a row. */
const LABEL_MAX = 40

/** A finding with no slice has no phrase to match on, so there is nothing to turn into a rule. A
 *  standing rule is the only kind that reaches here, and it is already on a pipeline. */
export function canAddRule(finding: Finding): boolean {
  return !!finding.slice?.trim()
}

/**
 * The literal phrase from a finding, as a text rule.
 *
 * Literal and case-insensitive on purpose: the user is capturing a phrase they just saw, and a
 * regex they did not ask for is a rule they cannot read later. Loosening it is an edit in the
 * pipeline's own rules list.
 */
export function ruleFromFinding(finding: Finding): TextRule {
  const find = (finding.slice ?? '').trim()
  return {
    id: crypto.randomUUID(),
    enabled: true,
    label: find.length > LABEL_MAX ? `${find.slice(0, LABEL_MAX - 1)}…` : find,
    find,
    regex: false,
    caseSensitive: false,
    scope: 'assistant',
    note: finding.message,
  }
}

/** Whether a pipeline already carries a literal rule for this phrase. Adding the same phrase twice
 *  produces two notes about one problem, which reads as the detector being broken. */
export function hasRuleFor(rules: TextRule[], finding: Finding): boolean {
  const find = (finding.slice ?? '').trim().toLowerCase()
  if (!find) return false
  return rules.some((r) => !r.regex && r.find.trim().toLowerCase() === find)
}
