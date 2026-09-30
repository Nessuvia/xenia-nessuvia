// Extension-ful imports on purpose: checkBuildStoryPrompt.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { ChatMessage } from '../connectors/connectorInterface'
import type { BlockContext, PromptStack } from '../storage/types'
import type { GuideChapter } from './chapterGuide.ts'
import { fitStoryProse, storyProseSplit } from './chapterGuide.ts'
import { resolveTemplate, variableValues } from './template.ts'
import { stackParts, stackVariables, templateBody, usesSlot } from './stackTemplate.ts'
import { swapStoryTokens } from './storyTokens.ts'
import type { Budget } from './budget.ts'
import { countTokens, perMessageOverhead } from './budget.ts'

/** An enabled cast member, flattened to the card fields the Co-Writer needs. The store resolves
 *  Character/Persona rows into this so the assembly stays pure and check-testable. */
export interface CastMember {
  name: string
  description: string
  personality?: string
  scenario?: string
  exampleDialogue?: string
}

/** The enabled cast as one block of reference text: one member per stanza, blank fields dropped. */
export function castText(members: CastMember[]): string {
  return members
    .map((m) =>
      [`Name: ${m.name}`, m.description, m.personality, m.scenario, m.exampleDialogue]
        .filter((s) => s && s.trim())
        .join('\n\n'),
    )
    .filter((s) => s.trim())
    .join('\n\n')
}

// The text a Story template pulls in. Filled after the Story tokens are swapped: a {{token}} the
// Author typed into their manuscript is manuscript.
const slotPattern = /\{\{\s*(cast|storyContext|storyTrailing|worldInfo|worldInfoAfter)\s*\}\}/gi

/**
 * The Story prose as the text a lorebook key is scanned against, newest last. An entry's scan depth
 * counts messages and a Story has none. A paragraph stands in for one: "scan depth 4" reads as
 * the last four paragraphs. `extra` goes on the end, for the Direction and the beat being written,
 * which are the newest statement of what the passage is about even though they aren't prose.
 */
export function storyScanText(story: string, extra: string[] = []): { content: string }[] {
  return [...story.split(/\n\s*\n/), ...extra]
    .map((content) => content.trim())
    .filter((content) => content)
    .map((content) => ({ content }))
}

/**
 * Keep the newest prose that fits, dropping whole lines from the top. Mirrors trimHistory's
 * end-backward rule for the single Story-context blob.
 * line-granular, no mid-line truncation. A single line bigger than the budget drops
 * everything, same as trimHistory. Upgrade to sentence/char granularity if that ever bites.
 */
export function fitEndBackward(text: string, available: number): string {
  if (available <= 0) return ''
  if (countTokens(text) + perMessageOverhead <= available) return text
  const lines = text.split('\n')
  let used = perMessageOverhead
  let keepFrom = lines.length
  for (let i = lines.length - 1; i >= 0; i--) {
    const cost = countTokens(lines[i]) + 1 // ~1 token for the rejoining newline
    if (used + cost > available) break
    used += cost
    keepFrom = i
  }
  return lines.slice(keepFrom).join('\n')
}

/**
 * Cap on the "What follows" block, in tokens.
 *
 * The trailing text is priced in the fixed pass: every token of it's a token `fitEndBackward`
 * can't spend on Story context. What the model needs is the passage it has to join up
 * with (the sentences immediately after the caret). A few hundred tokens carries the job, and
 * a caret placed near the top of a long Chapter must not push the whole preceding Story out of the
 * window. Raise it if joins start reading as though the model couldn't see far enough ahead.
 */
export const maxTrailingTokens = 400

/**
 * Keep the text nearest the caret, dropping whole lines from the bottom. The mirror image of
 * `fitEndBackward`: that one keeps the end of the prose, this one keeps the start of the tail.
 * In both cases the text closest to the insert point is the text that matters.
 */
export function fitStartForward(text: string, available: number): string {
  if (available <= 0) return ''
  if (countTokens(text) + perMessageOverhead <= available) return text
  const lines = text.split('\n')
  let used = perMessageOverhead
  let keepTo = 0
  for (let i = 0; i < lines.length; i++) {
    const cost = countTokens(lines[i]) + 1 // ~1 token for the rejoining newline
    if (used + cost > available) break
    used += cost
    keepTo = i + 1
  }
  return lines.slice(0, keepTo).join('\n')
}

/** What `storyFit` hands `buildStoryPrompt`, plus a readback of what the last fit cost. */
export interface StoryFit {
  storyText: string
  storyTrailing: string
  fitStoryText: (available: number) => string
  /** Blocks the last `fitStoryText` call degraded, and how many it could have. Read after
   *  `buildStoryPrompt` returns; before that both are 0. */
  degraded: () => { count: number; of: number }
}

/**
 * The Story prose and the ladder that fits it, in one object both Write-mode callers spread into
 * `buildStoryPrompt`. `generate` and the preview panel share it so what the preview shows and what
 * goes over the wire can't diverge, the job `fitChapterGuide` used to do.
 */
export function storyFit(
  chapters: GuideChapter[],
  activeId: number | null,
  blockId: string | null,
  context: BlockContext,
): StoryFit {
  const split = storyProseSplit(chapters, activeId, blockId, context)
  let last = { count: 0, of: 0 }
  return {
    storyText: split.text,
    storyTrailing: split.trailing,
    fitStoryText: (available) => {
      const fitted = fitStoryProse(chapters, activeId, blockId, context, available, countTokens)
      last = { count: fitted.degradedCount, of: fitted.degradable }
      return fitted.text
    },
    degraded: () => last,
  }
}

export interface BuildStoryArgs {
  stack: PromptStack
  castText: string
  /** The Story token table (`storyTokens`), substituted into the template text, never the prose. */
  tokens: Record<string, string>
  storyText: string
  /**
   * How to cut the Story prose down to what the budget leaves for it. Supplied by both Write-mode
   * callers as a closure over `fitStoryProse`, which degrades oldest-first from prose to beat
   * instructions; `generate` and the preview panel share the one closure so they can't diverge.
   *
   * Left out, `fitEndBackward` chops whole lines off the top instead. That's the fallback for a
   * caller with no Chapters to hand, which is every non-Write consumer.
   */
  fitStoryText?: (available: number) => string
  /** Prose after the caret, to the end of the active Chapter. '' when generating at the end, which
   *  is the common case. The slot renders empty. */
  storyTrailing?: string
  /** What the Story's lorebooks matched, already budgeted. `atDepth` entries have nowhere to go in
   *  Write mode (there's no history to splice into). Only the two slots arrive
   *  here. Absent = no books, or nothing matched. */
  worldInfo?: { before: string; after: string }
  direction: string
}

export interface BuiltStoryPrompt {
  messages: ChatMessage[]
  /** Everything except the Story prose: the fixed prefix + the Direction. */
  fixedTokens: number
  storyTokens: number
  storyIncluded: string
  /** Characters of Story prose the budget dropped from the top. */
  droppedChars: number
}

/**
 * Assembles a Write-mode request. The active Story stack's template places the fixed prefix;
 * `{{ storyContext }}` expands to as much prose as the budget holds, cut by `fitStoryText`;
 * the Direction rides last as a separate user turn, never merged into the prose. See the master's
 * Context assembly. Budget = the active connection's contextLimit.
 *
 * The beat isn't in the Direction. It reaches the model through {{beat}} / {{beatTargetWords}},
 * placed by the stack: a Story stack decides where the plan sits and how it's worded.
 */
export function buildStoryPrompt(args: BuildStoryArgs, budget?: Budget): BuiltStoryPrompt {
  const { stack, castText: cast, tokens, storyText, direction } = args

  // Priced in the fixed pass below, before the story fit spends what's left on the Story prose:
  // losing the text the model is writing towards would defeat the point of a caret insert.
  const storyTrailing = fitStartForward(args.storyTrailing ?? '', maxTrailingTokens)

  // Rendered twice with the same walk: once with no prose to price the fixed cost, once with the
  // prose the budget allowed. Anything but the Story text is identical between the passes: the
  // two runs line up 1:1 and the trim can't shift text into or out of the prompt.
  const worldInfo = args.worldInfo?.before ?? ''
  const worldInfoAfter = args.worldInfo?.after ?? ''
  const vars = variableValues(stackVariables(stack))
  // A Story has no speaker or cast flags. What it has is whether each slot holds anything, so a
  // wrapper like `<world_info>` can sit in `{% if worldInfo %}` and drop out with nothing inside.
  const flags = {
    cast: Boolean(cast.trim()),
    storytrailing: Boolean(storyTrailing.trim()),
    worldinfo: Boolean(worldInfo.trim()),
    worldinfoafter: Boolean(worldInfoAfter.trim()),
  }
  const parts = stackParts(resolveTemplate(templateBody(stack.template), flags, vars))

  const render = (story: string) => {
    const slots: Record<string, string> = {
      cast,
      storycontext: story,
      storytrailing: storyTrailing,
      worldinfo: worldInfo,
      worldinfoafter: worldInfoAfter,
    }
    const turns: ChatMessage[] = []
    for (const part of parts) {
      if (part.kind !== 'text') continue
      const content = swapStoryTokens(part.text, tokens)
        .replace(slotPattern, (_whole, name: string) => slots[name.toLowerCase()] ?? '')
        .replace(/\n(?:[ \t]*\n){2,}/g, '\n\n')
        .trim()
      if (content) turns.push({ role: part.role, content })
    }
    return turns
  }

  const fixed = render('')
  let fixedTokens = fixed.reduce((n, m) => n + countTokens(m.content) + perMessageOverhead, 0)

  // The Direction is fixed: always in, counted against the budget, never trimmed.
  const dir = direction.trim()
  if (dir) fixedTokens += countTokens(dir) + perMessageOverhead

  let storyIncluded = ''
  let droppedChars = 0
  if (usesSlot(stack.template, 'storyContext') && storyText.trim()) {
    if (budget) {
      const margin = (budget.contextLimit * budget.safetyMarginPct) / 100
      const available = Math.floor(budget.contextLimit - fixedTokens - budget.maxTokens - margin)
      storyIncluded = args.fitStoryText
        ? args.fitStoryText(available - perMessageOverhead)
        : fitEndBackward(storyText, available)
    } else {
      storyIncluded = storyText
    }
    droppedChars = storyText.length - storyIncluded.length
  }

  const out: ChatMessage[] = []
  // Neighbouring same-role turns merge: a run of system parts is one system message.
  const push = (role: ChatMessage['role'], content: string) => {
    const last = out.at(-1)
    if (last && last.role === role) last.content += `\n\n${content}`
    else out.push({ role, content })
  }

  for (const turn of render(storyIncluded)) push(turn.role, turn.content)

  // Kept separate on purpose: the Direction is the final user instruction, never folded into prose.
  if (dir) out.push({ role: 'user', content: dir })

  return { messages: out, fixedTokens, storyTokens: countTokens(storyIncluded), storyIncluded, droppedChars }
}
