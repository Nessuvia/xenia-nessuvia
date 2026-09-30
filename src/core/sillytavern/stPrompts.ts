// A chat-completion preset's prompt list as a stack. This is the closer of the two mappings: ST's
// `prompts` + `prompt_order` is already an ordered list of text and placeholders, which is what a
// stack is.
import type { StackVariable } from '../storage/types.ts'
import type { StChatPreset, StPrompt } from './stShapes.ts'
import { stBlock, type StPiece, type StSource } from './stBlock.ts'
import { convertComments, convertVariables, unmappedMacros } from './stMacros.ts'

/** ST's marker identifiers, and the one non-marker identifier with a bound source of its own. */
const identifierSources: Record<string, StSource> = {
  worldInfoBefore: 'worldInfo',
  worldInfoAfter: 'worldInfoAfter',
  charDescription: 'charDescription',
  charPersonality: 'charPersonality',
  scenario: 'charScenario',
  personaDescription: 'personaDescription',
  dialogueExamples: 'charExampleDialogue',
  chatHistory: 'history',
  // ST's name for the card's post-history instructions.
  jailbreak: 'postHistory',
}

const roleOf = (prompt: StPrompt): StPiece['role'] =>
  prompt.role === 'user' || prompt.role === 'assistant' ? prompt.role : 'system'

export interface PromptsImport {
  blocks: StPiece[]
  variables: StackVariable[]
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

  const blocks: StPiece[] = []
  const notes: string[] = []
  const used = new Set<StSource>()
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
          // postHistory falls back to the piece's own text when the card has none.
          // ST's jailbreak wording is worth keeping.
          content: source === 'postHistory' ? convertComments(prompt.content ?? '').content : '',
          ...(disabled ? { disabled: true } : {}),
        }),
      )
      continue
    }

    // A prompt that was only an author's note (ST's "Pick one" dividers) comes out empty and goes.
    const { content, info } = convertComments(prompt.content ?? '')
    if (!content.trim()) {
      skippedEmpty += 1
      continue
    }
    blocks.push(
      stBlock({
        label: prompt.name?.trim() || 'Prompt',
        role: roleOf(prompt),
        content,
        ...(info ? { info } : {}),
        ...(disabled ? { disabled: true } : {}),
        // injection_position 1 means ST splices this into the chat at a depth. 4 is ST's default.
        ...(prompt.injection_position === 1 ? { depth: prompt.injection_depth ?? 4 } : {}),
      }),
    )
  }

  if (skippedEmpty) notes.push(`${skippedEmpty} empty prompts were skipped.`)
  const converted = convertVariables(blocks)
  notes.push(...converted.notes)
  const unmapped = unmappedMacros(converted.blocks)
  if (unmapped.length) {
    notes.push(`SillyTavern macros left as plain text: ${unmapped.map((m) => `{{${m}}}`).join(', ')}.`)
  }
  return { blocks: converted.blocks, variables: converted.variables, notes }
}
