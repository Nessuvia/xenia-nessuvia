// The one export the UI uses. Pure: it reads a file's text and returns what could be made from it.
// Nothing here writes to a store or to Dexie, so the panel decides which parts get applied.
import type { Connection, TagRule } from '../stores/settingsStore.ts'
import type { InstructTemplate, ParamDef, ParamValue } from '../params/paramDef.ts'
import type { PromptBlock, PromptStack } from '../storage/types.ts'
import { currentOwnerId } from '../storage/storageInterface.ts'
import { validateStack } from '../../modules/prompts/stackKinds.ts'
import { sectionsOf, sniffShape } from './stShapes.ts'
import type { StBundle, StInstruct, StShape } from './stShapes.ts'
import { paramsFromPreset } from './stSamplers.ts'
import { blocksFromStoryString } from './stStoryString.ts'
import { blocksFromPrompts } from './stPrompts.ts'
import { stBlock } from './stBlock.ts'

/** The connection fields an import can fill. The panel merges these over `newConnection()`, which
 *  is where the id and the blank endpoint/key come from. */
export type ConnectionFields = Partial<
  Pick<Connection, 'name' | 'type' | 'params' | 'template' | 'contextLimit' | 'endpointUrl' | 'model'>
>

export interface StImport {
  shape: StShape
  label: string
  connection?: ConnectionFields
  stack?: PromptStack
  /** Sampler defs for keys the library has never seen, ready for `useParamDefs.create`. */
  newDefs: ParamDef[]
  /** From `reasoning`. A tag rule is global, so the panel asks before applying it. */
  tagRule?: TagRule
  /** What was dropped, and why. */
  notes: string[]
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** ST's instruct sequences as our template. */
function templateOf(instruct: StInstruct): InstructTemplate {
  const systemPrefix = text(instruct.system_sequence)
  const storyPrefix = text(instruct.story_string_prefix)
  // ST writes the BOS token into story_string_prefix, in front of the system sequence.
  const firstPrefix =
    systemPrefix && storyPrefix.endsWith(systemPrefix)
      ? storyPrefix.slice(0, -systemPrefix.length)
      : ''
  const stop = text(instruct.stop_sequence)
  const sequences = instruct.sequences_as_stop_strings
    ? [
        text(instruct.input_sequence),
        text(instruct.output_sequence),
        text(instruct.system_sequence),
        text(instruct.input_suffix),
        text(instruct.output_suffix),
      ]
    : []
  const stopSequences = [...new Set([stop, ...sequences].map((s) => s.trim()).filter(Boolean))]
  return {
    systemPrefix,
    systemSuffix: text(instruct.system_suffix),
    userPrefix: text(instruct.input_sequence),
    userSuffix: text(instruct.input_suffix),
    modelPrefix: text(instruct.output_sequence),
    modelSuffix: text(instruct.output_suffix),
    ...(firstPrefix ? { firstPrefix } : {}),
    stopSequences,
    trimTrailingSpace: true,
  }
}

/** The name to give the connection and the stack: whichever section carries one. */
function labelOf(sections: StBundle & { chat?: { name?: string } }, fallback: string): string {
  const named =
    sections.chat?.name ??
    (sections.preset?.name as string | undefined) ??
    sections.context?.name ??
    sections.sysprompt?.name ??
    sections.instruct?.name
  return text(named).trim() || fallback
}

/** Parse a SillyTavern export. Throws with a message meant for the user. */
export function parseSillyTavern(source: string, fileName = ''): StImport {
  let data: unknown
  try {
    data = JSON.parse(source)
  } catch {
    throw new Error('That file is not JSON.')
  }
  const shape = sniffShape(data)
  const sections = sectionsOf(shape, data as Record<string, unknown>)
  const fallback = fileName.replace(/\.json$/i, '').trim() || 'SillyTavern import'
  const label = labelOf(sections, fallback)
  const notes: string[] = []

  // --- connection -------------------------------------------------------
  const preset = sections.preset ? paramsFromPreset(sections.preset) : undefined
  const params: ParamValue[] = preset ? [...preset.params] : []
  const newDefs = preset?.newDefs ?? []
  if (preset) notes.push(...preset.notes)

  const template = sections.instruct ? templateOf(sections.instruct) : undefined
  if (template?.stopSequences.length && !params.some((p) => p.key === 'stop')) {
    params.push({ key: 'stop', value: template.stopSequences })
  }
  // A preset carrying only prompts, which plenty of chat-completion presets do, has nothing to put
  // on a connection. No empty connection then.
  let connection: ConnectionFields | undefined
  if (template || params.length || preset?.contextLimit || preset?.model || preset?.endpointUrl) {
    connection = {
      name: label,
      // An instruct template is only used by a text-completion connection; a chat-completion
      // preset is the other half of that fork.
      type: sections.instruct ? 'text' : 'chat',
      ...(params.length ? { params } : {}),
      ...(template ? { template } : {}),
      ...(preset?.contextLimit ? { contextLimit: preset.contextLimit } : {}),
      ...(preset?.endpointUrl ? { endpointUrl: preset.endpointUrl } : {}),
      ...(preset?.model ? { model: preset.model } : {}),
    }
  }

  // --- stack ------------------------------------------------------------
  const blocks: PromptBlock[] = []
  const systemPrompt = text(sections.sysprompt?.content).trim()
  if (systemPrompt) {
    blocks.push(stBlock({ label: 'System prompt', content: systemPrompt }))
  }
  if (sections.chat) {
    const fromPrompts = blocksFromPrompts(sections.chat)
    blocks.push(...fromPrompts.blocks)
    notes.push(...fromPrompts.notes)
  }
  const story = text(sections.context?.story_string)
  if (story) {
    const fromStory = blocksFromStoryString(story)
    blocks.push(...fromStory.blocks)
    if (fromStory.unknownTokens.length) {
      notes.push(
        `Left as plain text, nothing here maps them: ${fromStory.unknownTokens.map((t) => `{{${t}}}`).join(', ')}.`,
      )
    }
  }
  const chatStart = text(sections.context?.chat_start).trim()
  if (chatStart) blocks.push(stBlock({ label: 'Chat start', content: chatStart }))

  let stack: PromptStack | undefined
  if (blocks.length) {
    if (!blocks.some((b) => b.source === 'chatHistory')) {
      blocks.push(stBlock({ source: 'chatHistory' }))
    }
    const postHistory = text(sections.sysprompt?.post_history).trim()
    if (postHistory) {
      blocks.push(stBlock({ label: 'Post-history instructions', content: postHistory }))
    }
    stack = { ownerId: currentOwnerId(), name: label, kind: 'chat', active: blocks }
    const nudge = text(sections.chat?.continue_nudge_prompt).trim()
    if (nudge) stack.miscPrompts = { continue: nudge }
    // A stack the editor would refuse to save must not reach the summary as importable.
    const invalid = validateStack(stack)
    if (invalid) throw new Error(`That preset can't become a stack: ${invalid.toLowerCase()}.`)
  }

  // --- reasoning --------------------------------------------------------
  const open = text(sections.reasoning?.prefix).trim()
  const close = text(sections.reasoning?.suffix).trim()
  const tagRule: TagRule | undefined =
    open && close
      ? { id: crypto.randomUUID(), open, close, mode: 'collapse', label: 'Reasoning' }
      : undefined

  if (!connection && !stack) throw new Error('There was nothing in that file to import.')
  return { shape, label, connection, stack, newDefs, tagRule, notes }
}

/** What the panel puts in its summary line for a shape. */
export const shapeLabels: Record<StShape, string> = {
  bundle: 'Settings export',
  chatPreset: 'Chat completion preset',
  textgenPreset: 'Text completion preset',
  instruct: 'Instruct template',
  context: 'Context template',
  sysprompt: 'System prompt',
}
