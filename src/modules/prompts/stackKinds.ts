// Per-kind helpers for the stack editor. A Chat stack and a Story stack share one template language;
// `templateProblems` holds what each kind requires.
import type { PromptStack } from '../../core/storage/types'
import { templateProblems } from '../../core/prompt/stackTemplate.ts'

export type StackKind = 'chat' | 'story'

/** A stack's kind, defaulting rows written before the field existed to 'chat'. */
export const stackKind = (stack: Pick<PromptStack, 'kind'>): StackKind => stack.kind ?? 'chat'

/** Why the stack can't be saved, or '' when it's valid: the first template problem. */
export function validateStack(stack: PromptStack): string {
  const first = templateProblems(stack.template, stackKind(stack))[0]
  return first ? `Line ${first.line}: ${first.message}` : ''
}
