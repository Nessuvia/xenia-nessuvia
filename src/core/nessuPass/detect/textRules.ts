// Extension-ful imports on purpose: checkTextRules.ts runs this under `node --experimental-strip-types`.
import type { Note } from './note.ts'
import type { SecondPassRule } from '../stores/settingsStore.ts'
import { computeExclusions, type Range } from '../hammer/exclusions.ts'

/** Matches reported per rule. One rule matching forty times is one problem, not forty notes. */
const MAX_PER_RULE = 3

/** Escape a literal find so nothing in it is treated as a pattern. Same approach as
 *  `applyReplaceRules` in the chat renderer, which is the other place a user writes a find. */
function escape(find: string): string {
  return find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Compile a rule to a regex, or null if the user's pattern does not compile. An invalid regex is
 * skipped rather than thrown: the panel surfaces the syntax error, and a send must never break
 * because a rule is half-typed.
 */
export function compileRule(rule: SecondPassRule): RegExp | null {
  if (!rule.find) return null
  try {
    return new RegExp(rule.regex ? rule.find : escape(rule.find), rule.caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
}

/** Whether a match sits inside a code span, URL or link target, which are never the author's prose. */
function excluded(exclusions: Range[], start: number, end: number): boolean {
  return exclusions.some(([from, to]) => start < to && end > from)
}

function scopeMatches(scope: SecondPassRule['scope'], role: 'user' | 'assistant'): boolean {
  return scope === 'both' || scope === role
}

/**
 * Run the free-text rules and report what they matched, changing nothing.
 *
 * Called on the text the Grammar Hammer's strip pass already produced, so the spans are coordinates
 * into what the model will actually be shown, same as `findFlags`.
 */
export function findTextMatches(
  text: string,
  rules: SecondPassRule[],
  role: 'user' | 'assistant',
): Note[] {
  // A rule with no find is not a matcher; `standingNotes` handles those.
  const applicable = rules.filter((r) => r.enabled && r.find && scopeMatches(r.scope, role))
  if (applicable.length === 0) return []

  const exclusions = computeExclusions(text)
  const notes: Note[] = []

  for (const rule of applicable) {
    const re = compileRule(rule)
    if (!re) continue
    let found = 0
    for (const m of text.matchAll(re)) {
      if (found >= MAX_PER_RULE) break
      const start = m.index
      const end = start + m[0].length
      // A zero-width match (an empty regex, `\b`) would report a span with nothing in it and loop
      // the model on a slice it cannot find.
      if (end === start) continue
      if (excluded(exclusions, start, end)) continue
      found += 1
      notes.push({
        source: `text:${rule.label || rule.find}`,
        span: { start, end },
        slice: m[0],
        message:
          rule.note.trim() ||
          `"${m[0]}" was flagged. Rewrite the phrasing around it, or cut it if it carries nothing.`,
      })
    }
  }

  return notes.sort((a, b) => (a.span?.start ?? 0) - (b.span?.start ?? 0))
}

/**
 * The rules that carry no find: standing instructions, handed to the model on every pass.
 *
 * Kept apart from the matched notes rather than merged into them, because the two answer different
 * questions. A matched note says something is wrong with this reply. A standing rule says how prose
 * should read in general, and it is true of every reply including a clean one. Merging them would
 * make `skipWhenClean` dead the moment a single standing rule is enabled, since the note list would
 * never be empty.
 */
export function standingNotes(rules: SecondPassRule[], role: 'user' | 'assistant'): Note[] {
  return rules
    .filter((r) => r.enabled && !r.find && r.note.trim() && scopeMatches(r.scope, role))
    .map((r) => ({ source: `rule:${r.label || r.id}`, message: r.note.trim() }))
}
