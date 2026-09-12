// Per-kind config for the stack editor: which bound sources a kind exposes and how it validates.
// The difference between a Chat stack and a Story stack is data, not control flow: StackEditor
// reads these tables and stays one code path.
import type { BlockSource, PromptBlock, PromptStack } from '../../core/storage/types'

export type StackKind = 'chat' | 'story'

/** A stack's kind, defaulting rows written before the field existed to 'chat'. */
export const stackKind = (stack: Pick<PromptStack, 'kind'>): StackKind => stack.kind ?? 'chat'

/** Bound sources per kind: pulled in from elsewhere in the app, allowed once each at top level. */
export const boundSources: Record<StackKind, BlockSource[]> = {
  chat: [
    'characterDescription',
    'characterPersonality',
    'characterScenario',
    'characterExampleDialogue',
    'characterSystemPrompt',
    'characterPostHistory',
    'personaDescription',
    'worldInfo',
    'worldInfoAfter',
    'worldInfoDepth',
    'authorNote',
    'chatHistory',
  ],
  // No authorNote: a Story's standing instruction is the Direction box, and its premise/ending
  // reach the prompt as {{premise}} / {{ending}}.
  // No worldInfoDepth either: it splices entries into chat history at a depth, and a Story's prose
  // is one blob with nothing to count messages back from.
  story: ['cast', 'worldInfo', 'worldInfoAfter', 'storyContext', 'storyTrailing'],
}

/** Sources a block of this kind may take: freeform text plus the kind's bound sources. */
export const kindSources = (kind: StackKind): BlockSource[] => ['text', ...boundSources[kind]]

// Switched on only, at any depth: nesting a bound block inside a wrapper still uses that source
// and it counts. A disabled block takes its whole subtree out of the prompt. Neither counts then.
const countIn = (list: PromptBlock[], source: BlockSource): number =>
  list.reduce(
    (n, b) =>
      b.disabled ? n : n + (b.source === source ? 1 : 0) + countIn(b.children ?? [], source),
    0,
  )

const count = (stack: PromptStack, source: BlockSource) => countIn(stack.active, source)

/** Whether a stack has a live block of this source. A disabled one doesn't count: it contributes
 *  nothing, which is the same outcome as not having it. */
export const hasSource = (stack: PromptStack, source: BlockSource) => count(stack, source) > 0

/** Why the stack can't be saved, or '' when it's valid. Keyed by kind. */
export function validateStack(stack: PromptStack): string {
  if (count(stack, 'authorNote') > 1) return "Only one Author's note block allowed"
  if (count(stack, 'worldInfo') > 1) return 'Only one World info (before character) block allowed'
  if (count(stack, 'worldInfoAfter') > 1)
    return 'Only one World info (after character) block allowed'
  if (count(stack, 'worldInfoDepth') > 1) return 'Only one World info (at depth) block allowed'
  if (stackKind(stack) === 'story') {
    if (count(stack, 'chatHistory') > 0) return 'Story stacks have no Chat History block'
    if (count(stack, 'worldInfoDepth') > 0) return 'Story stacks have no World info (at depth) block'
    if (count(stack, 'authorNote') > 0) return "Story stacks have no Author's note block"
    if (count(stack, 'storyContext') === 0) return 'Add a Story context block'
    if (count(stack, 'storyContext') > 1) return 'Only one Story context block allowed'
    // Optional, unlike Story context: it renders empty whenever generation is at the end of a
    // Chapter.
    if (count(stack, 'storyTrailing') > 1) return 'Only one What follows block allowed'
    return ''
  }
  if (count(stack, 'chatHistory') === 0) return 'Add a Chat History block'
  if (count(stack, 'chatHistory') > 1) return 'Only one Chat History block allowed'
  return ''
}
