// Prompt stack files: the stack's own fields, without the row id or ownerId. Those belong to the
// browser that stores it, not to the file.
import type { PromptBlock, PromptStack, StackVariable } from '../../core/storage/types'
import { currentOwnerId } from '../../core/storage/storageInterface'
import { stackKind } from './stackKinds'
import { coerceMiscPrompts } from '../../core/prompt/miscPrompts'

interface StackFile {
  format: 'nessu-prompt-stack'
  version: 2
  name: string
  kind: 'chat' | 'story'
  active: PromptBlock[]
  /** Values included: a stack's settings travel with it. Absent in version 1 files. */
  variables?: StackVariable[]
  /** Overrides for the utility prompts. Part of how the stack prompts, so it travels with it. */
  miscPrompts?: Record<string, string>
  /** Written by older builds, when blocks could be parked out of the stack. Read, never written. */
  inactive?: PromptBlock[]
}

const fileName = (name: string) =>
  `${name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'stack'}.json`

export function exportStack(stack: PromptStack) {
  const file: StackFile = {
    format: 'nessu-prompt-stack',
    version: 2,
    name: stack.name,
    kind: stackKind(stack),
    active: stack.active,
    variables: stack.variables ?? [],
    ...(stack.miscPrompts ? { miscPrompts: stack.miscPrompts } : {}),
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

// Fresh ids all the way down: two stacks must never share a block identity while dragging, and a
// file can be imported twice.
const reid = (list: PromptBlock[]): PromptBlock[] =>
  list.map((b) => ({
    ...b,
    id: crypto.randomUUID(),
    ...(b.children ? { children: reid(b.children) } : {}),
  }))

/** Parse a stack file into a savable stack. Throws with a message meant for the user. */
export function parseStack(text: string): PromptStack {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not JSON.')
  }
  const file = data as Partial<StackFile>
  if (file?.format !== 'nessu-prompt-stack') throw new Error('That file is not a prompt stack.')
  if (!Array.isArray(file.active)) throw new Error('The stack file is missing its blocks.')
  // An older file's parked blocks import as disabled ones rather than being dropped.
  const parked = Array.isArray(file.inactive) ? file.inactive.map((b) => ({ ...b, disabled: true })) : []
  const misc = coerceMiscPrompts(file.miscPrompts)
  return {
    ownerId: currentOwnerId(),
    name: typeof file.name === 'string' && file.name ? file.name : 'Imported stack',
    kind: file.kind === 'story' ? 'story' : 'chat',
    active: reid([...file.active, ...parked]),
    variables: Array.isArray(file.variables) ? file.variables : [],
    ...(misc ? { miscPrompts: misc } : {}),
  }
}
