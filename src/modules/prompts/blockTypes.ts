// What a block *is*, as one flat list for the picker on the card: its source.
import type { BlockSource, PromptBlock } from '../../core/storage/types'

export const sourceLabels: Record<BlockSource, string> = {
  text: 'Freeform text',
  characterDescription: 'Character description',
  characterPersonality: 'Character personality',
  characterScenario: 'Character scenario',
  characterExampleDialogue: 'Character example dialogue',
  characterSystemPrompt: 'Character system prompt',
  characterPostHistory: 'Character post-history instructions',
  personaDescription: 'Persona description',
  authorNote: "Author's note",
  worldInfo: 'World info (before character)',
  worldInfoAfter: 'World info (after character)',
  worldInfoDepth: 'World info (at depth)',
  chatHistory: 'Chat history',
  cast: 'Cast',
  storyContext: 'Story context',
  storyTrailing: 'What follows',
}

export type BlockType = BlockSource

export const typeLabels = sourceLabels

/** The types a stack of this kind offers, in picker order. */
export const kindTypes = (sources: BlockSource[]): BlockType[] => sources

export const blockType = (block: PromptBlock): BlockType => block.source

/** Rewrite a block to be of `type`, keeping everything the new type still uses. The label follows
 *  along when it was the old type's name: a block the user renamed keeps its name. */
export function applyType(block: PromptBlock, type: BlockType): PromptBlock {
  const named = block.label === typeLabels[blockType(block)]
  const label = named ? typeLabels[type] : block.label
  return {
    ...block,
    label,
    source: type,
    // The point of an author's note block is depth injection: give a new one somewhere to land.
    ...(type === 'authorNote' && block.depth === undefined ? { depth: 2 } : {}),
    // Its entries go in as system turns unless the block says otherwise; a block retyped from a
    // user or assistant one would otherwise change how they read for no reason the user asked for.
    ...(type === 'worldInfoDepth' ? { role: 'system' as const } : {}),
  }
}
