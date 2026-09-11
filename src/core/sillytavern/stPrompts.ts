// A chat-completion preset's prompt list as a stack. This is the closer of the two mappings: ST's
// `prompts` + `prompt_order` is already an ordered list of text and placeholders, which is what a
// stack is.
import type { BlockSource, PromptBlock } from '../storage/types.ts'
import type { StChatPreset, StPrompt } from './stShapes.ts'
import { stBlock } from './stBlock.ts'

/** ST's marker identifiers, and the one non-marker identifier with a bound source of its own. */
const identifierSources: Record<string, BlockSource> = {
  worldInfoBefore: 'worldInfo',
  worldInfoAfter: 'worldInfoAfter',
  charDescription: 'characterDescription',
  charPersonality: 'characterPersonality',
  scenario: 'characterScenario',
  personaDescription: 'personaDescription',
  dialogueExamples: 'characterExampleDialogue',
  chatHistory: 'chatHistory',
  // ST's name for the card's post-history instructions.
  jailbreak: 'characterPostHistory',
}

const roleOf = (prompt: StPrompt): PromptBlock['role'] =>
  prompt.role === 'user' || prompt.role === 'assistant' ? prompt.role : 'system'

export interface PromptsImport {
  blocks: PromptBlock[]
  notes: string[]
}

/** The order ST would use: the longest one, which is the default entry (character_id 100001). */
function pickOrder(preset: StChatPreset) {
  const orders = (preset.prompt_order ?? []).filter((o) => Array.isArray(o.order))
  return orders.sort((a, b) => (b.order?.length ?? 0) - (a.order?.length ?? 0))[0]?.order ?? []
}

export function blocksFromPrompts(preset: StChatPreset): PromptsImport {
  const byId = new Map<string, StPrompt>()
  for (const prompt of preset.prompts ?? []) {
    if (prompt.identifier) byId.set(prompt.identifier, prompt)
  }
  const order = pickOrder(preset)
  // A preset with prompts and no order: take them in file order, honouring each prompt's own flag.
  const entries = order.length
    ? order
    : (preset.prompts ?? []).map((p) => ({ identifier: p.identifier, enabled: p.enabled !== false }))

  const blocks: PromptBlock[] = []
  const notes: string[] = []
  const used = new Set<BlockSource>()
  const depthPrompts: string[] = []
  let skippedEmpty = 0

  for (const entry of entries) {
    const prompt = entry.identifier ? byId.get(entry.identifier) : undefined
    if (!prompt) continue
    const disabled = entry.enabled === false
    const source = identifierSources[entry.identifier ?? '']

    if (source) {
      if (used.has(source)) {
        notes.push(`Second ${source} entry dropped: a stack holds one of each.`)
        continue
      }
      used.add(source)
      blocks.push(
        stBlock({
          source,
          // characterPostHistory falls back to the block's own text when the card has none, so
          // ST's jailbreak wording is worth keeping.
          content: source === 'characterPostHistory' ? (prompt.content ?? '') : '',
          ...(disabled ? { disabled: true, toggleable: true } : {}),
        }),
      )
      continue
    }

    const content = prompt.content ?? ''
    if (!content.trim()) {
      skippedEmpty += 1
      continue
    }
    // injection_position 1 means ST splices this into the chat at a depth. The only depth block we
    // have is the author's note, and it takes its text from the chat rather than from the stack, so
    // the prompt's own wording has nowhere to live there. It goes in where it sits in the order.
    if (prompt.injection_position === 1) {
      depthPrompts.push(prompt.name?.trim() || (entry.identifier ?? 'a prompt'))
    }
    blocks.push(
      stBlock({
        label: prompt.name?.trim() || 'Prompt',
        role: roleOf(prompt),
        content,
        toggleable: true,
        ...(disabled ? { disabled: true } : {}),
      }),
    )
  }

  if (skippedEmpty) notes.push(`${skippedEmpty} empty prompts were skipped.`)
  if (depthPrompts.length) {
    notes.push(
      `Injected at a depth in SillyTavern, imported in place: ${depthPrompts.join(', ')}.`,
    )
  }
  return { blocks, notes }
}
