// Text rule sets: tag rules and find/replace, picked per chat. Pure: callers hand in the sets.
import type { ReplaceRule, RuleSet, TagRule } from '../stores/settingsStore.ts'
import type { Chat, PromptStack, TextRules } from '../storage/types.ts'

export const globalSetId = 'global'
export const stackSetId = (stackId: number) => `stack:${stackId}`

/** A chat's sets in priority order. Absent = Global plus the stack's own set, if it has one. */
export function chatSetIds(chat: Chat | null | undefined, stack: PromptStack | undefined): string[] {
  if (chat?.ruleSetIds) return chat.ruleSetIds
  return stack?.id !== undefined && stack.textRules ? [globalSetId, stackSetId(stack.id)] : [globalSetId]
}

export interface NamedSet extends TextRules {
  id: string
  name: string
}

/** Every set a chat could pick: Global, each stack with rules, then the user's own. */
export function allSets(global: TextRules, stacks: PromptStack[], ruleSets: RuleSet[]): NamedSet[] {
  return [
    { id: globalSetId, name: 'Global', tagRules: global.tagRules, replaceRules: global.replaceRules },
    ...stacks
      .filter((s) => s.id !== undefined && s.textRules)
      .map((s) => ({ id: stackSetId(s.id!), name: s.name, ...s.textRules! })),
    ...ruleSets,
  ]
}

/** The top set wins a tag both define (same open marker). Find/replace rules all run, top set first. */
export function mergeSets(ids: string[], sets: NamedSet[]): TextRules {
  const tagRules: TagRule[] = []
  const replaceRules: ReplaceRule[] = []
  for (const id of ids) {
    const set = sets.find((s) => s.id === id)
    if (!set) continue
    for (const t of set.tagRules) if (!tagRules.some((r) => r.open === t.open)) tagRules.push(t)
    replaceRules.push(...set.replaceRules)
  }
  return { tagRules, replaceRules }
}

export const onScreen = (r: ReplaceRule) => r.applies !== 'prompt'
export const inPrompt = (r: ReplaceRule) => r.applies === 'prompt' || r.applies === 'both'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Find/replace on the send path. The display path is renderText's mapped version. */
export function applyReplace(text: string, rules: ReplaceRule[] | undefined, role: 'user' | 'assistant' | 'system'): string {
  let out = text
  for (const rule of rules ?? []) {
    if (!rule.enabled || !rule.find || !inPrompt(rule)) continue
    if (rule.target !== 'both' && rule.target !== role) continue
    try {
      out = out.replace(new RegExp(rule.regex ? rule.find : escape(rule.find), rule.flags), rule.replace)
    } catch {
      // Invalid pattern or flags: skip, the same as on screen.
    }
  }
  return out
}

/** Open and close markers guessed from the first `<name>` in a pattern, for turning a flagged
 *  SillyTavern script into a tag rule. Null when the pattern names no tag. */
export function guessTag(find: string): { open: string; close: string } | null {
  const m = /<\\?\/?\s*([a-z][\w-]*)/i.exec(find)
  return m ? { open: `<${m[1]}>`, close: `</${m[1]}>` } : null
}

export const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '')

/** Whether a tag rule applies to a message from `role`. No role (a stream, an export) = yes. */
export const tagApplies = (rule: TagRule, role?: string) =>
  !rule.target || rule.target === 'both' || !role || rule.target === role

export interface TagConversion {
  rule: ReplaceRule
  tag: Omit<TagRule, 'id'>
  /** An existing tag with the same markers already does this job. */
  covered: boolean
}

// A lazy any-character body, optionally captured. `.` only crosses lines with the `s` flag.
const bodyShapes = [String.raw`[\s\S]*?`, '[^]*?', String.raw`[\s\S]+?`, '[^]+?']
const dotShapes = ['.*?', '.+?']
const edgeSpace = String.raw`(?:\\[sn][*+])?`
const tagShape = new RegExp(
  String.raw`^${edgeSpace}<([a-z][\w-]*)>(\(?)(.+?)(\)?)<(?:\\)?\/\1>${edgeSpace}$`,
  'i',
)
const detailsShape = /^\s*<details>\s*<summary>([\s\S]*?)<\/summary>\s*\$1\s*<\/details>\s*$/i

/**
 * The tag rule a find/replace rule is equivalent to, or null. Deliberately narrow: the whole
 * pattern must be `<x>`, a lazy any-character body, `</x>`, with at most a whitespace eater at
 * either end, and the replacement must be empty (hide), `$1` (content only) or a `<details>`
 * around `$1` (collapse). Off rules and rules that touch the prompt are skipped: a tag is
 * display-only, so converting one would silently change what the model sees.
 */
export function tagFromRule(rule: ReplaceRule, tags: TagRule[]): TagConversion | null {
  if (!rule.enabled || !rule.regex || (rule.applies ?? 'display') !== 'display') return null
  const m = tagShape.exec(rule.find)
  if (!m) return null
  const [, name, openParen, body, closeParen] = m
  const captured = openParen === '('
  if (captured !== (closeParen === ')')) return null
  if (!bodyShapes.includes(body) && !(dotShapes.includes(body) && rule.flags.includes('s'))) return null

  const replace = rule.replace.trim()
  const details = detailsShape.exec(replace)
  let mode: TagRule['mode']
  let label = rule.name
  if (!replace) mode = 'hide'
  else if (captured && replace === '$1') mode = 'unwrap'
  else if (captured && details) {
    mode = 'collapse'
    label = stripHtml(details[1]).trim() || label
  } else return null

  const tag = { open: `<${name}>`, close: `</${name}>`, mode, label, target: rule.target }
  return { rule, tag, covered: tags.some((t) => t.open === tag.open && t.close === tag.close) }
}
