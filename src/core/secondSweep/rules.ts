// Extension-ful imports on purpose: the check scripts run this file and its importers under
// `node --experimental-strip-types`. Nothing here may reach the store.

/**
 * One detection rule.
 *
 * This used to be two types: a Grammar Hammer rule that matched parts of speech and could edit the
 * text, and a free-text rule that matched a string and could only report. They agreed on `id`,
 * `enabled`, `label`, `scope` and `caseSensitive` and disagreed on two things, how the match is
 * written and what happens to it. That is a mode and an action, so it is one type.
 *
 * The merge also filled in what fell between the old pair. A literal string could only ever flag,
 * and a part-of-speech pattern could only be edited from its own tab. Now `strip` works on a
 * literal and `flag` works on a pattern.
 *
 * Lives here rather than in the store: a rule is pipeline data, and a pipeline is a Dexie row.
 */
export interface Rule {
  id: string
  enabled: boolean
  label?: string

  /**
   * How `find` is read.
   *
   * - `literal`: the string itself, escaped. What a Slop-dentifier finding becomes.
   * - `regex`: a raw JS pattern.
   * - `pattern`: the part-of-speech DSL, `with a [adj] [noun]`, `[word]`, `[adj]+`, `{n,m}`.
   *
   * A `pattern` match can never cross a sentence boundary. A regex can, because that is what a
   * regex does. The rules editor says so next to the mode picker.
   */
  match: MatchMode
  /**
   * What to look for.
   *
   * **Blank means the rule always applies.** Most of what makes prose bad is a judgment rather
   * than a string: "no sentence whose only content is naming an emotion" has nothing to match on.
   * Those rules carry their instruction and no find, and go to the model on every pass.
   */
  find: string
  caseSensitive: boolean
  scope: 'assistant' | 'user' | 'both'

  /**
   * What happens to a match.
   *
   * The split is whether the fix is mechanical. `with a [adj] [noun]` cuts cleanly and `repairAll`
   * tidies the seam, so no model is needed. `[adv] [adj]` is a judgment call, and cutting it blind
   * deletes "quietly furious" along with the filler.
   */
  action: 'flag' | 'strip' | 'replace'
  /** `replace` only. `$0` is the whole match, `$1..$n` the capture groups: pattern slots in pattern
   *  order, regex groups in regex mode. Out-of-range refs render empty. */
  replacement?: string
  /** `flag` only: what the model is told, in the author's words. Blank falls back to a generic line
   *  naming the match. A rule with no find and no note has nothing to say and is skipped. */
  note: string
}

export type MatchMode = 'literal' | 'regex' | 'pattern'

export function newRule(): Rule {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    match: 'literal',
    find: '',
    caseSensitive: false,
    scope: 'assistant',
    action: 'flag',
    note: '',
  }
}

/** Matches reported per rule, for `flag` only. One rule matching forty times is one problem, not
 *  forty notes. `strip` and `replace` are uncapped: there, an unfixed match is the failure. */
export const MAX_FLAGS_PER_RULE = 3

/** Escape a literal find. Nothing in it is then treated as a pattern. Same approach as
 *  `applyReplaceRules` in the chat renderer, which is the other place a user writes a find. */
function escape(find: string): string {
  return find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Compile a `literal` or `regex` rule, or null if it has no find or does not compile. An invalid
 * regex is skipped rather than thrown: the panel surfaces the syntax error, and a send must never
 * break because a rule is half-typed. `pattern` rules compile through `hammer/pattern.ts` instead
 * and return null here.
 */
export function compileRule(rule: Rule): RegExp | null {
  if (!rule.find || rule.match === 'pattern') return null
  try {
    return new RegExp(
      rule.match === 'regex' ? rule.find : escape(rule.find),
      rule.caseSensitive ? 'g' : 'gi',
    )
  } catch {
    return null
  }
}

export function scopeMatches(scope: Rule['scope'], role: 'user' | 'assistant'): boolean {
  return scope === 'both' || scope === role
}

/** The message a flagged match carries: the author's note, or a line naming what was found. */
export function flagMessage(rule: Rule, slice: string): string {
  const note = rule.note.trim()
  if (note) return note
  if (rule.match === 'pattern') {
    return `Matches the "${rule.label || rule.find}" pattern, which looks like filler. Rewrite it or cut it, whichever keeps the meaning.`
  }
  return `"${slice}" was flagged. Rewrite the phrasing around it, or cut it if it carries nothing.`
}

/**
 * The rules that carry no find: standing instructions, handed to the model on every pass.
 *
 * Kept apart from the matched notes rather than merged into them: the two answer different
 * questions. A matched note says something is wrong with this reply. A standing rule says how prose
 * should read in general, and it is true of every reply including a clean one. Merging them would
 * make `skipWhenClean` dead the moment a single standing rule is enabled. The note list would
 * never be empty.
 */
export function standingRules(rules: Rule[], role: 'user' | 'assistant'): Rule[] {
  return rules.filter((r) => r.enabled && !r.find && r.note.trim() && scopeMatches(r.scope, role))
}
