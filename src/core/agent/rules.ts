// Imported by check scripts under `node --experimental-strip-types`. Nothing here may reach the store.
import type { Chip } from './builder.ts'

/**
 * One agent rule: a match mode and an action.
 */
export interface Rule {
  id: string
  enabled: boolean
  /** Absent reads as the sample: a rule is named after the sentence it was built from until renamed. */
  label?: string
  /**
   * How `find` is read.
   * - `pattern`: the part-of-speech DSL, `with a [adj] [noun]`, `[word]`, `[clause]`, `{n,m}`.
   * - `regex`: a raw JS pattern. The only mode that can cross a sentence.
   */
  match: MatchMode
  /** What to look for. A blank find matches nothing. For a built rule it is generated from the chips. */
  find: string
  /** `pattern` only: the sentence the builder tags into chips. Absent on a pattern written by hand. */
  sample?: string
  /** `pattern` only: one choice per chip of `sample`. See `builder.ts`. */
  chips?: Chip[]
  caseSensitive: boolean
  /**
   * What the agent does with a match.
   * - `swap`: replace the match in code. No request.
   * - `rewrite`: the model rewrites the sentence, or the paragraph when several sentences in it fail.
   * - `delete`: the sentence is removed.
   */
  action: 'swap' | 'rewrite' | 'delete'
  /** `swap` only. `$0` is the whole match, `$1..$n` the chips or capture groups. Blank removes the match. */
  replacement?: string
  /** `rewrite` only: one hit sends the whole paragraph to the model, not just the sentence. */
  wholeParagraph?: boolean
  /** `rewrite` only: what the model is told. */
  note: string
}

export type MatchMode = 'regex' | 'pattern'

export function newRule(): Rule {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    match: 'pattern',
    find: '',
    sample: '',
    chips: [],
    caseSensitive: false,
    action: 'rewrite',
    note: '',
  }
}

/**
 * Compile a `regex` rule, or null if it has no find or does not compile. An invalid regex is skipped
 * rather than thrown: the panel surfaces the syntax error, and a send must never break because a
 * rule is half-typed. `pattern` rules compile through `hammer/pattern.ts` instead and return null here.
 */
export function compileRule(rule: Rule): RegExp | null {
  if (!rule.find || rule.match !== 'regex') return null
  try {
    return new RegExp(rule.find, rule.caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
}

/** The action select's options and the line under it. Shared by the rules panel and "Make rule". */
export const actionLabels: [Rule['action'], string][] = [
  ['swap', 'Replace with'],
  ['rewrite', 'Rewrite sentence'],
  ['delete', 'Delete whole sentence'],
]

export const actionHints: Record<Rule['action'], string> = {
  swap: 'Replaces only the matched words. A blank replacement removes them, and the spacing, commas and capital letter around them are fixed.',
  rewrite: 'Sends the sentence the match is in to the model to rewrite.',
  delete: 'Removes the whole sentence the match is in. To remove only the matched words, use Replace with and leave it blank.',
}

/** The name a rule shows: its label, else its sample, else its find. */
export function ruleName(rule: Rule): string {
  return rule.label || rule.sample || rule.find
}

/** What the model is told about a match: the author's note, or a line quoting it. */
export function flagMessage(rule: Rule, slice: string): string {
  const note = rule.note.trim()
  if (note) return note
  return `"${slice}" was flagged. Rephrase it.`
}
