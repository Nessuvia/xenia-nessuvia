// Post-processing stack files: the name and the config, without the row id or ownerId. There's no
// connection field by construction, so a stack file never carries an API key.
import type { PostStack } from '../../core/storage/types'
import { defaultPostStackConfig, type PostStackConfig } from '../../core/agent/postStack'
import { currentOwnerId } from '../../core/storage/storageInterface'

interface PostStackFile {
  format: 'nessu-post-stack'
  version: 1
  name: string
  config: PostStackConfig
}

const fileName = (name: string) =>
  `${name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'post-stack'}.json`

export function exportPostStack(stack: PostStack) {
  const file: PostStackFile = {
    format: 'nessu-post-stack',
    version: 1,
    name: stack.name,
    config: stack.config,
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

// Fresh rule and swap ids: a file can be imported twice, and two stacks must never share a rule
// identity while dragging.
const reid = (config: PostStackConfig): PostStackConfig => ({
  ...config,
  swaps: { ...config.swaps, lexicon: config.swaps.lexicon.map((e) => ({ ...e, id: crypto.randomUUID() })) },
  rules: { ...config.rules, list: config.rules.list.map((r) => ({ ...r, id: crypto.randomUUID() })) },
})

/** Parse a stack file into a savable stack. Throws with a message meant for the user. */
export function parsePostStack(text: string): PostStack {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not JSON.')
  }
  const file = data as Partial<PostStackFile>
  if (file?.format !== 'nessu-post-stack') throw new Error('That file is not a post-processing stack.')
  if (!file.config) throw new Error('The stack file is missing its config.')
  const now = Date.now()
  return {
    ownerId: currentOwnerId(),
    name: typeof file.name === 'string' && file.name ? file.name : 'Imported stack',
    // Merged over the built-in config: a file written before a stage existed still opens, with that
    // stage at its default rather than undefined.
    config: reid({ ...defaultPostStackConfig(), ...file.config }),
    createdAt: now,
    updatedAt: now,
  }
}
