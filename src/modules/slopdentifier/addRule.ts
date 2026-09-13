// Extension-ful imports on purpose: checkAnalyse.ts runs `ruleFromFinding` under
// `node --experimental-strip-types`. The storage half lives in the component, not here.
import type { Rule } from '../../core/secondSweep/rules.ts'
import type { Finding } from './analyse.ts'

/** Label length. Long enough to recognise the phrase in a rules list, short enough to fit a row. */
const LABEL_MAX = 40

/** A finding with no slice has no phrase to match on. There is nothing to turn into a rule. A
 *  standing rule is the only kind that reaches here, and it is already on a pipeline. */
export function canAddRule(finding: Finding): boolean {
  return !!finding.slice?.trim()
}

/**
 * The literal phrase from a finding, as a rule.
 *
 * Literal, case-insensitive and reporting on purpose: the user is capturing a phrase they just
 * saw. A regex they did not ask for is a rule they cannot read later, and a strip they did not ask
 * for edits their replies. Loosening either is an edit in the pipeline's own rules list.
 */
export function ruleFromFinding(finding: Finding): Rule {
  const find = (finding.slice ?? '').trim()
  return {
    id: crypto.randomUUID(),
    enabled: true,
    label: find.length > LABEL_MAX ? `${find.slice(0, LABEL_MAX - 1)}…` : find,
    match: 'literal',
    find,
    caseSensitive: false,
    scope: 'assistant',
    action: 'flag',
    note: finding.message,
  }
}

/** Whether a pipeline already carries a literal rule for this phrase. Adding the same phrase twice
 *  produces two notes about one problem, which reads as the detector being broken. */
export function hasRuleFor(rules: Rule[], finding: Finding): boolean {
  const find = (finding.slice ?? '').trim().toLowerCase()
  if (!find) return false
  return rules.some((r) => r.match === 'literal' && r.find.trim().toLowerCase() === find)
}
