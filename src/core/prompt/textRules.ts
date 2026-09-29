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
