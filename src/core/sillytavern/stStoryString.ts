// SillyTavern's context template is one Handlebars string; ours is a list of blocks. Flattening it
// loses the conditionals, which costs nothing: every `{{#if description}}` in a real template is
// "include this field when the card has one", and a bound block already renders nothing when its
// source is empty.
import type { BlockSource, PromptBlock } from '../storage/types.ts'
import { stBlock } from './stBlock.ts'

/** ST's context placeholders that we have a bound source for. */
const tokenSources: Record<string, BlockSource> = {
  description: 'characterDescription',
  personality: 'characterPersonality',
  scenario: 'characterScenario',
  mesexamples: 'characterExampleDialogue',
  mesexamplesraw: 'characterExampleDialogue',
  persona: 'personaDescription',
  wibefore: 'worldInfo',
  lorebefore: 'worldInfo',
  wiafter: 'worldInfoAfter',
  loreafter: 'worldInfoAfter',
}

/** Tokens our own `{{...}}` substitution already handles, so they stay in the text as they are. */
const passThrough = new Set(['char', 'user'])

/** Template machinery with no content of its own. `{{system}}` is the system prompt, which the
 *  import emits as its own block from `sysprompt`, so the placeholder is dropped too. */
const dropped = new Set(['else', 'trim', 'system'])

const labelFor = (text: string) => {
  const line = text.split('\n').find((l) => l.trim()) ?? ''
  const trimmed = line.trim().slice(0, 40)
  return trimmed || 'Text'
}

export interface StoryStringImport {
  blocks: PromptBlock[]
  /** Placeholders left in the text as-is, because nothing here maps them. */
  unknownTokens: string[]
}

/** A context template as ordered blocks. */
export function blocksFromStoryString(story: string): StoryStringImport {
  const blocks: PromptBlock[] = []
  const unknownTokens: string[] = []
  const used = new Set<BlockSource>()
  let buffer = ''

  const flush = () => {
    const text = buffer.replace(/\n{3,}/g, '\n\n').trim()
    buffer = ''
    if (text) blocks.push(stBlock({ label: labelFor(text), content: text }))
  }

  let cursor = 0
  for (const match of story.matchAll(/\{\{([^{}]*)\}\}/g)) {
    buffer += story.slice(cursor, match.index)
    cursor = match.index + match[0].length
    const raw = match[1].trim()
    const name = raw.toLowerCase()
    // {{! comment }}, {{#if x}}, {{/if}}: the body stays, the machinery goes.
    if (/^[#/!]/.test(raw) || dropped.has(name)) continue
    if (passThrough.has(name)) {
      buffer += match[0]
      continue
    }
    const source = tokenSources[name]
    if (!source) {
      buffer += match[0]
      if (!unknownTokens.includes(raw)) unknownTokens.push(raw)
      continue
    }
    // Our stack allows one block per bound source; a template naming one twice keeps the first.
    if (used.has(source)) continue
    used.add(source)
    flush()
    blocks.push(stBlock({ source }))
  }
  buffer += story.slice(cursor)
  flush()
  return { blocks, unknownTokens }
}
