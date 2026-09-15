// Imported by check scripts under `node --experimental-strip-types`. Nothing here may reach the store.
import { exampleRegex, type Slots } from './example.ts'

/**
 * One agent rule: a match mode and an action.
 */
export interface Rule {
  id: string
  enabled: boolean
  label?: string
  /**
   * How `find` is read.
   * - `literal`: the string itself, escaped.
   * - `regex`: a raw JS pattern.
   * - `pattern`: the part-of-speech DSL, `with a [adj] [noun]`, `[word]`, `[adj]+`, `{n,m}`.
   */
  match: MatchMode
  /** What to look for. A blank find matches nothing. */
  find: string
  /** `literal` only: words of `find` that match other words. See `example.ts`. */
  slots?: Slots
  /** `literal` only: a hand-edited regex that no longer reads back as the example. Wins over `find`. */
  regexOverride?: string
  caseSensitive: boolean
  /**
   * What the agent does with a match.
   * - `swap`: replace the match in code. No request.
   * - `rewrite`: the model rewrites the sentence, or the paragraph when several sentences in it fail.
   * - `delete`: the sentence is removed.
   */
  action: 'swap' | 'rewrite' | 'delete'
  /** `swap` only. `$0` is the whole match, `$1..$n` the capture groups. Blank removes the match. */
  replacement?: string
  /** `rewrite` only: one hit sends the whole paragraph to the model, not just the sentence. */
  wholeParagraph?: boolean
  /** `rewrite` only: what the model is told. */
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
    action: 'rewrite',
    note: '',
  }
}

/** The regex source a `literal` or `regex` rule runs as. */
export function ruleSource(rule: Rule): string {
  if (rule.match === 'regex') return rule.find
  return rule.regexOverride ?? exampleRegex(rule.find, rule.slots)
}

/**
 * Compile a `literal` or `regex` rule, or null if it has no find or does not compile. An invalid
 * regex is skipped rather than thrown: the panel surfaces the syntax error, and a send must never
 * break because a rule is half-typed. `pattern` rules compile through `hammer/pattern.ts` instead
 * and return null here.
 */
export function compileRule(rule: Rule): RegExp | null {
  if (!rule.find || rule.match === 'pattern') return null
  const source = ruleSource(rule)
  if (!source) return null
  try {
    return new RegExp(source, rule.caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
}


/** What the model is told about a match: the author's note, or a line quoting it. */
export function flagMessage(rule: Rule, slice: string): string {
  const note = rule.note.trim()
  if (note) return note
  return `"${slice}" was flagged. Rephrase it.`
}
