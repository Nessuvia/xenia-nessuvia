// Extension-ful imports on purpose: checkConditions.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { Character, PromptBlock } from '../storage/types'
import { isNarrator } from '../multiplayer/narrator.ts'
import { castSlots } from './swapTokens.ts'

/**
 * The conditions a prompt can branch on, by lowercased name. Deliberately a flat table of
 * booleans rather than an expression language: `[if]` reads like code without becoming one.
 *
 * `narrator`: the speaker this turn is the Narrator.
 * `char1`…`char4`: that cast slot is filled. Matches the {{charN}} tokens one for one.
 * `game`: this send is a game's commentary rather than a chat turn.
 * The game's own kind, as written in `GameKind`: `goFish`, `blackjack`. One stack covers every
 * game: the per-game half of the prompt is a branch in it rather than a stack each.
 */
export interface PromptConditions {
  /** Tracker values ride here too, behind `[if affection > 50]`. */
  [name: string]: boolean | number | string | string[]
}

/**
 * The flags for one send. Names are lowercase; `resolveConditions` folds before it looks up.
 *
 * `game` is the `GameKind` string, taken as a plain string rather than the type: an unknown name is
 * false like any other. This file stays free of core/games, and a new game needs no edit here.
 */
export function promptConditions(speaker: Character, cast?: Character[], game?: string): Record<string, boolean> {
  const flags: Record<string, boolean> = { narrator: isNarrator(speaker.id), game: Boolean(game) }
  for (let i = 0; i < castSlots; i++) {
    flags[`char${i + 1}`] = Boolean(cast?.[i])
  }
  if (game) flags[game.toLowerCase()] = true
  return flags
}

/** One recognised directive line. `name` is empty for [else] and [endif]. */
interface Directive {
  keyword: 'if' | 'elseif' | 'else' | 'endif'
  name: string
  negated: boolean
  /** A comparison: `[if affection > 50]`. Absent = truthiness. */
  op?: Op
  value?: string
}

type Op = '>' | '<' | '>=' | '<=' | '=' | '!='

const directivePattern =
  /^\[(if|elseif|else|endif)(?:\s+(?:(not)\s+)?([A-Za-z0-9_]+)(?:\s*(>=|<=|!=|=|>|<)\s*([^\]]*?))?)?\s*\]$/i

/**
 * A directive only when the whole trimmed line is one. Prose on the same line, a missing name on
 * [if], or a name on [else] all read as literal text, same forgiveness as an unknown {{token}}.
 */
function directive(line: string): Directive | undefined {
  const match = directivePattern.exec(line.trim())
  if (!match) return undefined
  const keyword = match[1].toLowerCase() as Directive['keyword']
  const negated = Boolean(match[2])
  const name = match[3] ?? ''
  const needsName = keyword === 'if' || keyword === 'elseif'
  // [if] with no name, or [else] with one, is not a directive.
  if (needsName !== (name !== '')) return undefined
  const op = match[4] as Op | undefined
  const value = match[5]?.replace(/^"(.*)"$/, '$1')
  // [if affection >] with nothing to compare against is prose.
  if (op && !value) return undefined
  return { keyword, name: name.toLowerCase(), negated, op, value }
}

/**
 * True when `text` branches on `name` in a way `resolveConditions` would honour: an `[if name]` or
 * `[elseif name]` line, negated or not. Written against `directive()` rather than a fresh regex so
 * the two can never disagree about what counts, and a near-miss like `[if narrator` reads as prose
 * to both. Comparison is case-insensitive, as `promptConditions` names are.
 *
 * Used to decide whether a prompt stack has already said something about the Narrator, in which
 * case the global Narrator text in Settings stays out of the way.
 */
export function mentionsCondition(text: string, name: string): boolean {
  if (!text.includes('[')) return false
  const wanted = name.toLowerCase()
  return text.split('\n').some((line) => {
    const found = directive(line)
    return found?.name === wanted && (found.keyword === 'if' || found.keyword === 'elseif')
  })
}

/**
 * The same question asked of a whole prompt stack. Walks children, reads the selected option of a
 * block that has options, and skips a disabled block, which contributes nothing to a prompt and so
 * should not count as the stack having an opinion.
 *
 * Only text a block carries itself is scanned. A card field pulled in by a non-text block cannot
 * hold directives anyway: `resolveConditions` runs over the stack's own text.
 */
export function blocksMentionCondition(blocks: PromptBlock[], name: string): boolean {
  return blocks.some((block) => {
    if (block.disabled) return false
    const own = block.options ? (block.options[block.activeOption ?? 0]?.content ?? '') : block.content
    if (mentionsCondition(own, name)) return true
    if (mentionsCondition(block.closeContent ?? '', name)) return true
    return blocksMentionCondition(block.children ?? [], name)
  })
}

/** A parsed line: literal text, or a conditional. */
type Node = string | Conditional

interface Branch {
  /** Absent on [else]: an else branch is always eligible. */
  name?: string
  negated: boolean
  op?: Op
  value?: string
  /** The directive line as written, for putting an unclosed conditional back verbatim. */
  line: string
  body: Node[]
}

interface Conditional {
  branches: Branch[]
}

function isConditional(node: Node): node is Conditional {
  return typeof node !== 'string'
}

/**
 * Lines to a tree. Directives that can't pair up (a stray [endif], an [else] with no [if]) go in
 * as literal text, and an [if] left open at the end is flattened back to its own lines.
 */
function parse(lines: string[]): Node[] {
  const root: Node[] = []
  // Innermost last. Each frame is the conditional being built and the list it will be added to.
  const open: { node: Conditional; parent: Node[] }[] = []
  const current = () => (open.length ? open[open.length - 1].node.branches.at(-1)!.body : root)

  for (const line of lines) {
    const found = directive(line)
    if (!found) {
      current().push(line)
      continue
    }

    if (found.keyword === 'if') {
      const node: Conditional = {
        branches: [{ name: found.name, negated: found.negated, op: found.op, value: found.value, line, body: [] }],
      }
      open.push({ node, parent: current() })
      continue
    }

    // Everything below needs an open [if]; without one the directive is just text.
    const frame = open[open.length - 1]
    if (!frame) {
      current().push(line)
      continue
    }

    if (found.keyword === 'endif') {
      open.pop()
      current().push(frame.node)
      continue
    }

    frame.node.branches.push({
      name: found.keyword === 'else' ? undefined : found.name,
      negated: found.negated,
      op: found.op,
      value: found.value,
      line,
      body: [],
    })
  }

  // Unclosed [if]s, innermost first: put the whole thing back as the text it was written as.
  while (open.length) {
    const frame = open.pop()!
    frame.parent.push(...flatten(frame.node))
  }
  return root
}

/** An unclosed conditional as the literal lines it came from, directives included. */
function flatten(node: Conditional): Node[] {
  const out: Node[] = []
  for (const branch of node.branches) {
    out.push(branch.line, ...branch.body)
  }
  return out
}

/**
 * One condition. Numbers compare as numbers. Text takes `=` and `!=`, case-insensitive. A list
 * `= x` means it holds x. A missing name is false, whatever the operator.
 */
function holds(flag: PromptConditions[string] | undefined, op?: Op, value?: string): boolean {
  if (!op || value === undefined) return Array.isArray(flag) ? flag.length > 0 : Boolean(flag)
  if (flag === undefined || typeof flag === 'boolean') return false
  const want = value.trim().toLowerCase()
  if (typeof flag === 'number') {
    const n = Number(want)
    if (!want || Number.isNaN(n)) return false
    return { '>': flag > n, '<': flag < n, '>=': flag >= n, '<=': flag <= n, '=': flag === n, '!=': flag !== n }[op]
  }
  if (op !== '=' && op !== '!=') return false
  const equal = Array.isArray(flag) ? flag.some((x) => x.toLowerCase() === want) : flag.toLowerCase() === want
  return equal === (op === '=')
}

function render(nodes: Node[], flags: PromptConditions, out: string[]): void {
  for (const node of nodes) {
    if (!isConditional(node)) {
      out.push(node)
      continue
    }
    // First eligible branch wins; an [else] has no name and always qualifies. No match emits
    // nothing at all: an [if] with no [else] simply drops.
    const branch = node.branches.find(
      (b) => b.name === undefined || holds(flags[b.name], b.op, b.value) !== b.negated,
    )
    if (branch) render(branch.body, flags, out)
  }
}

/**
 * Resolves `[if X]` / `[elseif X]` / `[else]` / `[endif]` line-directives in prompt text. Runs
 * before token substitution: a token inside a dropped branch is never swapped and no token
 * value can be mistaken for a condition name.
 *
 * Directive lines are consumed whole: a taken branch comes out with no blank line where the
 * `[if]` was. Nesting works. An unknown condition name is false: a typo drops a branch rather
 * than breaking the prompt, and malformed structure stays literal rather than throwing.
 */
export function resolveConditions(text: string, flags: PromptConditions): string {
  // No bracket, no directive. Every ordinary prompt takes this exit.
  if (!text.includes('[')) return text
  const out: string[] = []
  render(parse(text.split('\n')), flags, out)
  return out.join('\n')
}
