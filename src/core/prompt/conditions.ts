// Extension-ful imports on purpose: checkConditions.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { Character } from '../storage/types'
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
 * game, so the per-game half of the prompt is a branch in it rather than a stack each.
 */
export interface PromptConditions {
  [name: string]: boolean
}

/**
 * The flags for one send. Names are lowercase; `resolveConditions` folds before it looks up.
 *
 * `game` is the `GameKind` string, taken as a plain string rather than the type: an unknown name is
 * false like any other, so this file stays free of core/games and a new game needs no edit here.
 */
export function promptConditions(speaker: Character, cast?: Character[], game?: string): PromptConditions {
  const flags: PromptConditions = { narrator: isNarrator(speaker.id), game: Boolean(game) }
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
}

const directivePattern = /^\[(if|elseif|else|endif)(?:\s+(?:(not)\s+)?([A-Za-z0-9_]+))?\]$/i

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
  return { keyword, name: name.toLowerCase(), negated }
}

/** A parsed line: literal text, or a conditional. */
type Node = string | Conditional

interface Branch {
  /** Absent on [else]: an else branch is always eligible. */
  name?: string
  negated: boolean
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
        branches: [{ name: found.name, negated: found.negated, line, body: [] }],
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

function render(nodes: Node[], flags: PromptConditions, out: string[]): void {
  for (const node of nodes) {
    if (!isConditional(node)) {
      out.push(node)
      continue
    }
    // First eligible branch wins; an [else] has no name and always qualifies. No match emits
    // nothing at all, so an [if] with no [else] simply drops.
    const branch = node.branches.find(
      (b) => b.name === undefined || Boolean(flags[b.name]) !== b.negated,
    )
    if (branch) render(branch.body, flags, out)
  }
}

/**
 * Resolves `[if X]` / `[elseif X]` / `[else]` / `[endif]` line-directives in prompt text. Runs
 * before token substitution, so a token inside a dropped branch is never swapped and no token
 * value can be mistaken for a condition name.
 *
 * Directive lines are consumed whole: a taken branch comes out with no blank line where the
 * `[if]` was. Nesting works. An unknown condition name is false, so a typo drops a branch rather
 * than breaking the prompt, and malformed structure stays literal rather than throwing.
 */
export function resolveConditions(text: string, flags: PromptConditions): string {
  // No bracket, no directive. Every ordinary prompt takes this exit.
  if (!text.includes('[')) return text
  const out: string[] = []
  render(parse(text.split('\n')), flags, out)
  return out.join('\n')
}
