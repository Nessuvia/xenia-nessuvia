// A block factory for the importer. `newBlock` in `core/stores/stacksStore.ts` is the same three
// lines, but reaching it pulls in Dexie and zustand, and checkSillyTavern.ts runs this folder under
// plain node. The label defaults to the source's own name, which is what the stack editor shows for
// a bound block anyway.
import type { PromptBlock } from '../storage/types.ts'
// core reaching into a module for a label table, same as stacksStore reaching for parseStack.
import { sourceLabels } from '../../modules/prompts/blockTypes.ts'

export function stBlock(partial: Partial<PromptBlock> = {}): PromptBlock {
  const source = partial.source ?? 'text'
  return {
    id: crypto.randomUUID(),
    label: sourceLabels[source],
    source,
    role: 'system',
    content: '',
    ...partial,
  }
}
