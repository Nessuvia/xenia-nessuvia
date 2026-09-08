// Extension-ful imports on purpose: checkRuleJson.ts runs this under `node --experimental-strip-types`.
import type { GrammarHammerRule, SecondPassRule } from '../stores/settingsStore.ts'
import { tryCompile } from '../hammer/pattern.ts'

/**
 * Rules in and out as JSON, so a set can be written in a file, pasted from somewhere, or handed to
 * someone else. Rules are the part of Second Pass worth sharing: they are prose about prose, and
 * authoring twenty of them through a form is miserable.
 *
 * A file carries both halves. `rules` are the free-text checks and `hammer` the POS patterns; the
 * two are one working set in practice, and splitting them across two files means half a set imports
 * and nobody notices. Nothing ships enabled in the app itself, so a file is the only way either
 * list gets filled.
 *
 * Untrusted input. A rule's `find` becomes a RegExp, a Hammer rule's `pattern` is compiled, and a
 * `note` goes into a prompt, so all three are checked here rather than where they are used.
 */

/** What `exportRules` writes and `parseRuleFile` recognises. */
const FORMAT = 'nessuTavern.rules'

/** Both halves of a rule set. Either may be empty; a file with neither is rejected. */
export interface RuleFile {
  rules: SecondPassRule[]
  hammer: GrammarHammerRule[]
}

export function exportRules(rules: SecondPassRule[], hammer: GrammarHammerRule[] = []): string {
  return JSON.stringify({ format: FORMAT, rules, hammer }, null, 2)
}

export function downloadRules(rules: SecondPassRule[], hammer: GrammarHammerRule[] = []) {
  const url = URL.createObjectURL(
    new Blob([exportRules(rules, hammer)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `XeniaNessuvia-rules-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function obj(raw: unknown, what: string, index: number): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${what} ${index + 1} is not an object.`)
  }
  return raw as Record<string, unknown>
}

function one(raw: unknown, index: number): SecondPassRule {
  const r = obj(raw, 'Rule', index)
  const find = str(r.find)
  const note = str(r.note)
  // A rule with neither has nothing to match and nothing to say. `textRules` skips it silently,
  // which would make a typo in a pasted file look like a successful import.
  if (!find.trim() && !note.trim()) throw new Error(`Rule ${index + 1} has no find and no note.`)

  const regex = bool(r.regex, false)
  if (regex && find.trim()) {
    try {
      new RegExp(find)
    } catch (err) {
      throw new Error(`Rule ${index + 1} has a bad regex: ${(err as Error).message}`)
    }
  }

  const scope = r.scope === 'user' || r.scope === 'both' ? r.scope : 'assistant'
  return {
    // Always a fresh id. An imported file may carry ids already in the list, and the same rule
    // twice under one id is worse than the same rule twice.
    id: crypto.randomUUID(),
    enabled: bool(r.enabled, true),
    label: str(r.label) || undefined,
    find,
    regex,
    caseSensitive: bool(r.caseSensitive, false),
    scope,
    note,
  }
}

function oneHammer(raw: unknown, index: number): GrammarHammerRule {
  const r = obj(raw, 'Hammer rule', index)
  const pattern = str(r.pattern).trim()
  if (!pattern) throw new Error(`Hammer rule ${index + 1} has no pattern.`)
  const caseSensitive = bool(r.caseSensitive, false)
  // Compiled here rather than at run time: a bad pattern in a pasted file should be an import
  // error naming the rule, not a row that silently matches nothing.
  const compiled = tryCompile(pattern, caseSensitive)
  if ('error' in compiled) {
    throw new Error(`Hammer rule ${index + 1} has a bad pattern: ${compiled.error}`)
  }
  const action =
    r.action === 'replace' || r.action === 'flag' ? r.action : ('strip' as GrammarHammerRule['action'])
  const scope = r.scope === 'user' || r.scope === 'both' ? r.scope : 'assistant'
  return {
    id: crypto.randomUUID(),
    enabled: bool(r.enabled, true),
    label: str(r.label) || undefined,
    pattern,
    action,
    ...(action === 'replace' ? { replacement: str(r.replacement) } : {}),
    scope,
    caseSensitive,
  }
}

/**
 * Read a rule file. Four shapes are accepted, because all four are things a person actually has to
 * hand: what `exportRules` wrote, a bare array of text rules, a single text rule object, and a file
 * carrying only `hammer`.
 */
export function parseRuleFile(text: string): RuleFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    throw new Error(`Not JSON: ${(err as Error).message}`)
  }

  const bundle =
    data && typeof data === 'object' && !Array.isArray(data) && ('rules' in data || 'hammer' in data)
      ? (data as { rules?: unknown; hammer?: unknown })
      : null

  const rawRules = bundle ? (bundle.rules ?? []) : Array.isArray(data) ? data : [data]
  const rawHammer = bundle?.hammer ?? []
  if (!Array.isArray(rawRules)) throw new Error('"rules" is not a list.')
  if (!Array.isArray(rawHammer)) throw new Error('"hammer" is not a list.')

  const rules = rawRules.map(one)
  const hammer = rawHammer.map(oneHammer)
  if (rules.length === 0 && hammer.length === 0) throw new Error('No rules in that file.')
  return { rules, hammer }
}
