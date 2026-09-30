// Prompt stack files: the stack's own fields, without the row id or ownerId. Those belong to the
// browser that stores it, not to the file.
import type { PromptStack, StackLook, StackValue, TextRules } from '../../core/storage/types'
import { currentOwnerId } from '../../core/storage/storageInterface'
import { stackKind } from './stackKinds'
import { coerceMiscPrompts } from '../../core/prompt/miscPrompts'

interface StackFile {
  format: 'nessu-prompt-stack'
  /** 3 is the template format. Block-shaped files (1 and 2) are refused. */
  version: 3
  name: string
  kind: 'chat' | 'story'
  template: string
  /** A stack's settings travel with it. */
  values?: Record<string, StackValue>
  /** Overrides for the utility prompts. Part of how the stack prompts, so it travels with it. */
  miscPrompts?: Record<string, string>
  /** The custom layout. `allowRemote` never travels: a downloaded file can't switch it on. */
  look?: StackLook
  /** The stack's own tag and find/replace rules. */
  textRules?: TextRules
}

const fileName = (name: string) =>
  `${name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'stack'}.json`

export function exportStack(stack: PromptStack) {
  const file: StackFile = {
    format: 'nessu-prompt-stack',
    version: 3,
    name: stack.name,
    kind: stackKind(stack),
    template: stack.template,
    ...(stack.values ? { values: stack.values } : {}),
    ...(stack.miscPrompts ? { miscPrompts: stack.miscPrompts } : {}),
    ...(stack.look ? { look: stack.look } : {}),
    ...(stack.textRules ? { textRules: stack.textRules } : {}),
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = fileName(stack.name)
  link.click()
  URL.revokeObjectURL(url)
}

/** Parse a stack file into a savable stack. Throws with a message meant for the user. */
export function parseStack(text: string): PromptStack {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("That file isn't JSON.")
  }
  const file = data as Partial<StackFile>
  if (file?.format !== 'nessu-prompt-stack') throw new Error("That file isn't a prompt stack.")
  if (typeof file.template !== 'string') throw new Error('That stack file is from an older version and has no template.')
  const misc = coerceMiscPrompts(file.miscPrompts)
  return {
    ownerId: currentOwnerId(),
    name: typeof file.name === 'string' && file.name ? file.name : 'Imported stack',
    kind: file.kind === 'story' ? 'story' : 'chat',
    template: file.template,
    ...(file.values && typeof file.values === 'object' ? { values: file.values } : {}),
    ...(misc ? { miscPrompts: misc } : {}),
    ...(typeof file.look?.html === 'string' && typeof file.look.css === 'string'
      ? { look: { html: file.look.html, css: file.look.css, ...(file.look.hideUnplaced === true ? { hideUnplaced: true } : {}) } }
      : {}),
    ...(Array.isArray(file.textRules?.tagRules) && Array.isArray(file.textRules.replaceRules)
      ? { textRules: { tagRules: file.textRules.tagRules, replaceRules: file.textRules.replaceRules } }
      : {}),
  }
}
