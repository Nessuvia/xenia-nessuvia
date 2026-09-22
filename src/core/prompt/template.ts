// Extension-ful imports on purpose: checkTemplate.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { Character, PromptBlock, StackVariable } from '../storage/types'
import { isNarrator } from '../multiplayer/narrator.ts'
import { castSlots } from './swapTokens.ts'

/**
 * The names a prompt can branch on, lowercased. Two sources merge here: the built-in flags below
 * plus tracker values, and a stack's declared variables (`variableValues`), which win a clash.
 *
 * `narrator`: the speaker this turn is the Narrator.
 * `char1`...`char4`: that cast slot is filled. Matches the {{charN}} tokens one for one.
 * `game`: this send is a game's commentary rather than a chat turn.
 * The game's own kind, as written in `GameKind`: `goFish`, `blackjack`. One stack covers every
 * game: the per-game half of the prompt is a branch in it rather than a stack each.
 */
export interface PromptConditions {
  /** Tracker values ride here too, behind `{% if affection > 50 %}`. */
  [name: string]: boolean | number | string | string[]
}

/** A stack variable's value as a template sees it. A range is two names, never one. */
export type VariableValues = Record<string, boolean | number | string>

/**
 * The built-in flags for one send. Names are lowercase; `resolveTemplate` folds before it looks up.
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

/** A stack's variables by lowercased id. A range reads as `{{id_start}}` and `{{id_end}}`. */
export function variableValues(variables: StackVariable[] | undefined): VariableValues {
  const out: VariableValues = {}
  for (const v of variables ?? []) {
    const id = v.id.toLowerCase()
    if (Array.isArray(v.value)) {
      out[`${id}_start`] = v.value[0]
      out[`${id}_end`] = v.value[1]
    } else out[id] = v.value
  }
  return out
}

/** One recognised tag. `name` is empty for else and endif. */
interface Directive {
  keyword: 'if' | 'elif' | 'else' | 'endif'
  name: string
  negated: boolean
  /** A comparison: `{% if affection > 50 %}`. Absent = truthiness. */
  op?: Op
  value?: string
}

type Op = '>' | '<' | '>=' | '<=' | '=' | '!='

// `%` is kept out of the expression so a line holding two tags never reads as one.
const directivePattern =
  /^\{%\s*(if|elif|else|endif)(?:\s+(?:(not)\s+)?([A-Za-z0-9_]+)(?:\s*(>=|<=|!=|==|=|>|<)\s*([^%]*?))?)?\s*%\}$/i
const tagPattern = /(\{%[^%]*%\})/

/**
 * A directive only when the whole trimmed piece is one tag. A missing name on if, a name on else,
 * or an operator with nothing after it all read as literal text, same forgiveness as an unknown
 * {{token}}.
 */
function directive(piece: string): Directive | undefined {
  const match = directivePattern.exec(piece.trim())
  if (!match) return undefined
  const keyword = match[1].toLowerCase() as Directive['keyword']
  const negated = Boolean(match[2])
  const name = match[3] ?? ''
  const needsName = keyword === 'if' || keyword === 'elif'
  if (needsName !== (name !== '')) return undefined
  const op = (match[4] === '==' ? '=' : match[4]) as Op | undefined
  const value = match[5]?.replace(/^"(.*)"$/, '$1')
  if (op && !value) return undefined
  return { keyword, name: name.toLowerCase(), negated, op, value }
}

/**
 * True when `text` branches on `name` in a way `resolveTemplate` would honour: an if or elif tag,
 * negated or not, on its own line or inline. Written against `directive()` so the two can never
 * disagree about what counts.
 *
 * Used to decide whether a prompt stack has already said something about the Narrator, in which
 * case the global Narrator text in Settings stays out of the way.
 */
export function mentionsCondition(text: string, name: string): boolean {
  if (!text.includes('{%')) return false
  const wanted = name.toLowerCase()
  return text.split(tagPattern).some((piece) => {
    const found = directive(piece)
    return found?.name === wanted && (found.keyword === 'if' || found.keyword === 'elif')
  })
}

/**
 * The same question asked of a whole prompt stack. Walks children and skips a disabled block,
 * which contributes nothing to a prompt and so shouldn't count as the stack having an opinion.
 */
export function blocksMentionCondition(blocks: PromptBlock[], name: string): boolean {
  return blocks.some((block) => {
    if (block.disabled) return false
    if (mentionsCondition(block.content, name)) return true
    if (mentionsCondition(block.closeContent ?? '', name)) return true
    return blocksMentionCondition(block.children ?? [], name)
  })
}

/** A parsed piece: literal text, or a conditional. */
type Node = string | Conditional

interface Branch {
  /** Absent on else: an else branch is always eligible. */
  name?: string
  negated: boolean
  op?: Op
  value?: string
  /** The tag as written, for putting an unclosed conditional back verbatim. */
  piece: string
  body: Node[]
}

interface Conditional {
  branches: Branch[]
}

const isConditional = (node: Node): node is Conditional => typeof node !== 'string'

/**
 * Pieces to a tree. The pieces are lines (block tags) or one line's fragments (inline tags): the
 * same structure either way. Tags that can't pair up go in as literal text, and an if left open at
 * the end is flattened back to its own pieces.
 */
function parse(pieces: string[]): Node[] {
  const root: Node[] = []
  const open: { node: Conditional; parent: Node[] }[] = []
  const current = () => (open.length ? open[open.length - 1].node.branches.at(-1)!.body : root)

  for (const piece of pieces) {
    const found = directive(piece)
    if (!found) {
      current().push(piece)
      continue
    }
    const branch = (): Branch => ({
      name: found.keyword === 'else' ? undefined : found.name,
      negated: found.negated,
      op: found.op,
      value: found.value,
      piece,
      body: [],
    })
    if (found.keyword === 'if') {
      open.push({ node: { branches: [branch()] }, parent: current() })
      continue
    }
    const frame = open[open.length - 1]
    if (!frame) {
      current().push(piece)
      continue
    }
    if (found.keyword === 'endif') {
      open.pop()
      current().push(frame.node)
      continue
    }
    frame.node.branches.push(branch())
  }

  while (open.length) {
    const frame = open.pop()!
    frame.parent.push(...flatten(frame.node))
  }
  return root
}

function flatten(node: Conditional): Node[] {
  return node.branches.flatMap((b) => [b.piece, ...b.body])
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

function render(nodes: Node[], flags: PromptConditions, out: string[], inline: (s: string) => string): void {
  for (const node of nodes) {
    if (!isConditional(node)) {
      out.push(inline(node))
      continue
    }
    // First eligible branch wins; an else always qualifies. No match emits nothing.
    const branch = node.branches.find(
      (b) => b.name === undefined || holds(flags[b.name], b.op, b.value) !== b.negated,
    )
    if (branch) render(branch.body, flags, out, inline)
  }
}

function resolveInline(line: string, flags: PromptConditions): string {
  if (!line.includes('{%')) return line
  const out: string[] = []
  render(parse(line.split(tagPattern)), flags, out, (s) => s)
  return out.join('')
}

const varPattern = /\{\{([A-Za-z0-9_]+)\}\}/g

/**
 * Resolves Django-style tags, then a stack's `{{variable}}`s. Runs before token substitution: a
 * token inside a dropped branch is never swapped.
 *
 * A tag alone on its line is a block tag and is consumed with its line, so a taken branch leaves no
 * blank line behind; those can span lines and nest. A tag sharing its line with text is inline and
 * has to close on that same line. An unknown name is false, an unknown {{name}} is left alone, and
 * malformed structure stays literal rather than throwing.
 */
export function resolveTemplate(text: string, conditions: PromptConditions, vars: VariableValues = {}): string {
  if (!text.includes('{')) return text
  const flags = { ...conditions, ...vars }
  let result = text
  if (text.includes('{%')) {
    const out: string[] = []
    render(parse(text.split('\n')), flags, out, (line) => resolveInline(line, flags))
    result = out.join('\n')
  }
  return result.replace(varPattern, (whole, name: string) => {
    const value = vars[name.toLowerCase()]
    return value === undefined ? whole : String(value)
  })
}
