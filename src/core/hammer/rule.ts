// Extension-ful imports on purpose: the check scripts run this file's importers under
// `node --experimental-strip-types`.

/**
 * A Grammar Hammer rule. `strip` deletes the whole match; `replace` swaps it for `replacement`,
 * which may reference capture groups (`$1..$n`, one per pattern token; `$0` = whole match), like
 * Find & Replace but with a part-of-speech find.
 *
 * `flag` edits nothing and hands the match to the pass's editing model as a note instead. The
 * split is whether the fix is mechanical. `with a [adj] [noun]` cuts cleanly and `repairAll` tidies
 * the seam, so no model is wanted. `[adv] [adj]` is a judgment call, and cutting it blind deletes
 * "quietly furious" along with the filler.
 *
 * Lives here rather than in the store because a rule is hammer data, and the pipeline that carries
 * a list of them is stored in Dexie rather than in settings.
 */
export interface GrammarHammerRule {
  id: string
  enabled: boolean
  label?: string
  pattern: string // DSL source, e.g. `with a [adj] [noun]`
  action: 'strip' | 'replace' | 'flag'
  replacement?: string // used when action === 'replace'; '' collapses to a strip
  scope: 'assistant' | 'user' | 'both'
  caseSensitive: boolean
}

export function newHammerRule(): GrammarHammerRule {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    pattern: '',
    action: 'strip',
    scope: 'assistant',
    caseSensitive: false,
  }
}
