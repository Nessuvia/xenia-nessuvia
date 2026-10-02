// Literal find and replace over the document: no patterns, so `<reader>` or `*` is what it says.
// Plus the rule sets' Find & Replace rules, shown over the document without changing it.
import type { ReplaceRule } from '../../core/stores/settingsStore.ts'

/**
 * Where the on-screen Find & Replace rules change the document, and what each range shows instead.
 * Each rule runs over the stored text, top rule first; a match overlapping an earlier one is
 * skipped. Invalid patterns are skipped, as in chat.
 * ponytail: rules don't see each other's output, unlike chat's chained pass. Chain them through a
 * source map (chat/sourceMap.ts) if a rule set ever depends on that.
 */
export function ruleMatches(text: string, rules: ReplaceRule[]): { from: number; to: number; insert: string }[] {
  const out: { from: number; to: number; insert: string }[] = []
  for (const rule of rules) {
    if (!rule.enabled || !rule.find || rule.applies === 'prompt') continue
    const source = rule.regex ? rule.find : rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    let all: RegExp
    let one: RegExp
    try {
      all = new RegExp(source, rule.flags.includes('g') ? rule.flags : `${rule.flags}g`)
      one = new RegExp(source, rule.flags.replace('g', ''))
    } catch {
      continue
    }
    for (const m of text.matchAll(all)) {
      const from = m.index
      const to = from + m[0].length
      if (to === from || out.some((o) => from < o.to && to > o.from)) continue
      out.push({ from, to, insert: m[0].replace(one, rule.replace) })
    }
  }
  return out.sort((a, b) => a.from - b.from)
}

/** Where every match starts, left to right, never overlapping. Empty `find` matches nothing. */
export function findAll(text: string, find: string, matchCase: boolean): number[] {
  if (!find) return []
  const hay = matchCase ? text : text.toLowerCase()
  const needle = matchCase ? find : find.toLowerCase()
  const out: number[] = []
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) out.push(at)
  return out
}
