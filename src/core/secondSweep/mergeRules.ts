// Extension-ful imports on purpose: checkMergeRules.ts runs this under
// `node --experimental-strip-types`. Pure: nothing here reaches the store.
import { type Rule } from './rules.ts'

/**
 * The two rule shapes that came before `Rule`, and the conversion between them.
 *
 * Kept as local types rather than imported: the modules that declared them are gone, and a
 * converter that owns its input shape cannot drift when the current type changes. Nothing outside
 * this file should read them.
 *
 * Every old rule converts. There is no lossy case and no drop list, so `resolvePipeline` runs this
 * silently on read.
 */
interface LegacyHammerRule {
  id: string
  enabled: boolean
  label?: string
  pattern: string
  action: 'strip' | 'replace' | 'flag'
  replacement?: string
  scope: 'assistant' | 'user' | 'both'
  caseSensitive: boolean
}

interface LegacyTextRule {
  id: string
  enabled: boolean
  label?: string
  find: string
  regex: boolean
  caseSensitive: boolean
  scope: 'assistant' | 'user' | 'both'
  note: string
}

/** A hammer rule is a pattern-mode rule. Its action and replacement carry across untouched. */
export function ruleFromHammer(old: LegacyHammerRule): Rule {
  return {
    id: old.id,
    enabled: old.enabled,
    label: old.label,
    match: 'pattern',
    find: old.pattern ?? '',
    caseSensitive: old.caseSensitive ?? false,
    scope: old.scope ?? 'assistant',
    action: old.action ?? 'strip',
    replacement: old.replacement,
    // A hammer rule had nowhere to write a note. Blank falls back to the generic pattern line,
    // which is what these rules produced before.
    note: '',
  }
}

/** A text rule is a literal or regex rule that flags. It never had another action. */
export function ruleFromText(old: LegacyTextRule): Rule {
  return {
    id: old.id,
    enabled: old.enabled,
    label: old.label,
    match: old.regex ? 'regex' : 'literal',
    find: old.find ?? '',
    caseSensitive: old.caseSensitive ?? false,
    scope: old.scope ?? 'assistant',
    action: 'flag',
    note: old.note ?? '',
  }
}

/**
 * Merge a pipeline's two old lists into one.
 *
 * Hammer rules first, then text rules. That is the order `collectFindings` ran them in, so a
 * converted pipeline behaves the same way on its first run as it did on its last.
 */
export function mergeRules(hammer: unknown, text: unknown): Rule[] {
  const out: Rule[] = []
  if (Array.isArray(hammer)) {
    for (const r of hammer) if (isRecord(r)) out.push(ruleFromHammer(r as unknown as LegacyHammerRule))
  }
  if (Array.isArray(text)) {
    for (const r of text) if (isRecord(r)) out.push(ruleFromText(r as unknown as LegacyTextRule))
  }
  return out
}

/** Whether a stored rule list is the old shape. A hammer rule has `pattern`, a text rule has
 *  `regex`, and a current rule has `match`. An empty list needs no conversion either way. */
export function looksLegacy(rules: unknown): boolean {
  if (!Array.isArray(rules) || rules.length === 0) return false
  return rules.some((r) => isRecord(r) && !('match' in r) && ('pattern' in r || 'regex' in r))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
