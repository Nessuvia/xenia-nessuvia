// Extension-ful imports on purpose: checkBuildStoryPrompt.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { ChatMessage } from '../connectors/connectorInterface'
import type { PromptStack } from '../storage/types'
import { resolveTemplate, variableValues } from './template.ts'
import { stackParts, stackVariables, templateBody } from './stackTemplate.ts'
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

/**
 * The document as the text a lorebook key is scanned against, newest last. An entry's scan depth
 * counts messages and a Story has none, so a paragraph stands in for one: "scan depth 4" reads as
 * the last four paragraphs. `extra` goes on the end, for the Author's Note and the current beat,
 * which are the newest statement of what the passage is about even though they aren't prose.
 */
export function storyScanText(story: string, extra: string[] = []): { content: string }[] {
  return [...story.split(/\n\s*\n/), ...extra]
    .map((content) => content.trim())
    .filter((content) => content)
    .map((content) => ({ content }))
}

/**
 * Keep the newest text that fits, dropping whole lines from the top.
 * ponytail: line-granular, no mid-line truncation. A single line bigger than the budget drops
 * everything. Upgrade to sentence granularity if one huge paragraph ever bites.
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
 * Cap on `{{after}}`, in tokens. It's priced in the fixed pass, so every token of it is one
 * `{{before}}` can't have. The model needs the sentences right after the cursor to join up with;
 * a cursor near the top of a long document must not push everything before it out of the window.
 */
export const maxTrailingTokens = 400

/** Keep the text nearest the cursor, dropping whole lines from the bottom. `fitEndBackward`'s mirror. */
export function fitStartForward(text: string, available: number): string {
  if (available <= 0) return ''
  if (countTokens(text) + perMessageOverhead <= available) return text
  const lines = text.split('\n')
  let used = perMessageOverhead
  let keepTo = 0
  for (let i = 0; i < lines.length; i++) {
    const cost = countTokens(lines[i]) + 1
    if (used + cost > available) break
    used += cost
    keepTo = i + 1
  }
  return lines.slice(0, keepTo).join('\n')
}

export const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length

/**
 * The beat list as the template sees it: the first one not done is current, every undone one after
 * it is lookahead, and the done ones are sent too, in order, for a template that wants them. Blank
 * beats are skipped.
 */
export function beatValues(beats: { text: string; done: boolean }[]): { beat: string; nextBeats: string[]; doneBeats: string[] } {
  const filled = beats.filter((b) => b.text.trim())
  const todo = filled.filter((b) => !b.done).map((b) => b.text.trim())
  return { beat: todo[0] ?? '', nextBeats: todo.slice(1), doneBeats: filled.filter((b) => b.done).map((b) => b.text.trim()) }
}

export type StoryAction = 'continue' | 'rewrite' | 'expand' | 'shorten'

/** Everything the app hands a Story template. The template owns every word around these. */
export interface StoryInputs {
  action: StoryAction
  /** The document before the cursor (or before the selection). Trimmed from the top to fit. */
  before: string
  /** The document after the cursor (or after the selection). Capped at `maxTrailingTokens`. */
  after: string
  /** The selected text a rewrite, expand or shorten replaces. '' for continue. */
  selection: string
  /** What the Author typed for a rewrite. '' otherwise. */
  instruction: string
  title: string
  premise: string
  ending: string
  /** The first beat not ticked off. '' when every beat is done or there are none. */
  beat: string
  nextBeats: string[]
  doneBeats: string[]
  note: string
  cast: string
  castNames: string[]
  /** What the Story's lorebooks matched, already budgeted. Absent = nothing matched. */
  worldInfo?: { before: string; after: string }
}

export interface BuiltStoryPrompt {
  messages: ChatMessage[]
  /** Everything except `{{before}}`. */
  fixedTokens: number
  beforeIncluded: string
  /** Characters of `{{before}}` the budget dropped from the top. */
  droppedChars: number
}

const lines = (items: string[]) => items.map((s) => `- ${s.trim()}`).join('\n')

// Filled after the template resolves. A {{token}} the Author typed into the document is document,
// and a {{roll}} inside it is never rolled.
const slotNames = [
  'before',
  'after',
  'selection',
  'action',
  'instruction',
  'title',
  'premise',
  'ending',
  'beat',
  'nextBeats',
  'doneBeats',
  'note',
  'cast',
  'castNames',
  'lead',
  'worldInfo',
  'worldInfoAfter',
]
const slotPattern = new RegExp(`\\{\\{\\s*(${slotNames.join('|')})\\s*\\}\\}`, 'gi')

/**
 * Assembles a Write-mode request. The active Story stack's template places every value; this
 * supplies them and trims `{{before}}` from the top until the request fits the budget.
 */
export function buildStoryPrompt(stack: PromptStack, inputs: StoryInputs, budget?: Budget): BuiltStoryPrompt {
  const after = fitStartForward(inputs.after, maxTrailingTokens)
  const slots: Record<string, string> = {
    after,
    selection: inputs.selection,
    action: inputs.action,
    instruction: inputs.instruction,
    title: inputs.title,
    premise: inputs.premise,
    ending: inputs.ending,
    beat: inputs.beat,
    nextbeats: lines(inputs.nextBeats),
    donebeats: lines(inputs.doneBeats),
    note: inputs.note,
    cast: inputs.cast,
    castnames: inputs.castNames.join(', '),
    // The first enabled cast member: a POV a stack can fall back on when none is named.
    lead: inputs.castNames[0] ?? '',
    worldinfo: inputs.worldInfo?.before ?? '',
    worldinfoafter: inputs.worldInfo?.after ?? '',
  }
  // Every slot is also a condition: `{% if after %}`, `{% if action = rewrite %}`. `before` counts
  // as present when there's any document at all, trimmed or not.
  const flags: Record<string, string> = { ...slots, before: inputs.before }
  for (const k of Object.keys(flags)) flags[k] = flags[k].trim() ? flags[k] : ''
  flags.action = inputs.action
  const parts = stackParts(resolveTemplate(templateBody(stack.template), flags, variableValues(stackVariables(stack))))

  const render = (before: string): ChatMessage[] => {
    const filled = { ...slots, before }
    const turns: ChatMessage[] = []
    for (const part of parts) {
      if (part.kind !== 'text') continue
      const content = part.text
        .replace(slotPattern, (_whole, name: string) => filled[name.toLowerCase() as keyof typeof filled] ?? '')
        .replace(/\n(?:[ \t]*\n){2,}/g, '\n\n')
        .trim()
      if (!content) continue
      // Neighbouring same-role turns merge: a run of system parts is one system message.
      const last = turns.at(-1)
      if (last && last.role === part.role) last.content += `\n\n${content}`
      else turns.push({ role: part.role, content })
    }
    return turns
  }

  const fixedTokens = render('').reduce((n, m) => n + countTokens(m.content) + perMessageOverhead, 0)
  let beforeIncluded = inputs.before
  if (budget) {
    const margin = (budget.contextLimit * budget.safetyMarginPct) / 100
    const available = Math.floor(budget.contextLimit - fixedTokens - budget.maxTokens - margin)
    beforeIncluded = fitEndBackward(inputs.before, available)
  }
  return {
    messages: render(beforeIncluded),
    fixedTokens,
    beforeIncluded,
    droppedChars: inputs.before.length - beforeIncluded.length,
  }
}
