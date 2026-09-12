// What a block *is*, as one flat list for the picker on the card. A type is a source, plus
// 'scroll': a text block carrying a range input, which is a distinct thing to the user even
// though the stored difference is just `input`.
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

export type BlockType = BlockSource | 'scroll'

export const typeLabels: Record<BlockType, string> = { ...sourceLabels, scroll: 'Scroll' }

/** The types a stack of this kind offers, in picker order. */
export const kindTypes = (sources: BlockSource[]): BlockType[] => {
  const [text, ...bound] = sources
  return [text, 'scroll', ...bound]
}

export const blockType = (block: PromptBlock): BlockType =>
  block.input ? 'scroll' : block.source

const seedScroll = 'Write about {{blockVal}} to {{blockVal2}} words.'

/** Rewrite a block to be of `type`, keeping everything the new type still uses. The label follows
 *  along when it was the old type's name: a block the user renamed keeps its name. */
export function applyType(block: PromptBlock, type: BlockType): PromptBlock {
  const named = block.label === typeLabels[blockType(block)]
  const label = named ? typeLabels[type] : block.label
  if (type === 'scroll') {
    return {
      ...block,
      label,
      source: 'text',
      // Options and a scroll value are two ways to vary one block's text; a scroll uses content.
      options: undefined,
      activeOption: undefined,
      content: block.content.trim() ? block.content : seedScroll,
      input: { kind: 'range', min: 0, max: 500, step: 10, value: 100, value2: 200 },
    }
  }
  return {
    ...block,
    label,
    source: type,
    input: undefined,
    // The point of an author's note block is depth injection: give a new one somewhere to land.
    ...(type === 'authorNote' && block.depth === undefined ? { depth: 2 } : {}),
    // Its entries go in as system turns unless the block says otherwise; a block retyped from a
    // user or assistant one would otherwise change how they read for no reason the user asked for.
    ...(type === 'worldInfoDepth' ? { role: 'system' as const } : {}),
  }
}
