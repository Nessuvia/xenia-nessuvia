import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { PostStack } from '../storage/types'
import { defaultPostStackConfig, type PostStackConfig } from '../agent/postStack'
import { useSettings } from './settingsStore'

export function newPostStack(name = 'Default'): PostStack {
  const now = Date.now()
  return {
    ownerId: currentOwnerId(),
    name,
    config: defaultPostStackConfig(),
    createdAt: now,
    updatedAt: now,
  }
}

interface PostStacksState {
  stacks: PostStack[]
  load(): Promise<void>
  save(stack: PostStack): Promise<number>
  /** Patch one stack's config. The whole editor writes through this. */
  patchConfig(id: number, patch: Partial<PostStackConfig>): Promise<void>
  rename(id: number, name: string): Promise<void>
  create(name?: string): Promise<number>
  duplicate(id: number): Promise<number>
  remove(id: number): Promise<void>
  /** How many chats name each stack, keyed by stack id. Chats with no stack of their own aren't
   *  counted against the default: they follow it rather than pick it. */
  usage(): Promise<Record<number, number>>
}

export const usePostStacks = create<PostStacksState>()((set, get) => ({
  stacks: [],

  load: async () => {
    // One "Default" stack seeded on first run as an ordinary row: editable, and once deleted it
    // stays gone. Same contract as the prompt stacks. With none left, `resolvePostStack` falls
    // back to the built-in config, so nothing breaks.
    if (!useSettings.getState().seededPostStacks) {
      useSettings.getState().markPostStacksSeeded()
      const id = await storage.put('postStacks', newPostStack() as unknown as StoredRecord)
      useSettings.getState().setAgent({ defaultStackId: id })
    }
    // Merged over the built-in config, the way `setAppearance` merges its defaults: a stack saved
    // before a stage existed opens with that stage at its default instead of undefined. This is
    // not a migration, nothing is written back; it only keeps a new field from being a crash.
    const rows = (await storage.getAll('postStacks')) as unknown as PostStack[]
    set({ stacks: rows.map((s) => ({ ...s, config: { ...defaultPostStackConfig(), ...s.config } })) })
  },

  save: async (stack) => {
    const id = await storage.put('postStacks', { ...stack, updatedAt: Date.now() } as unknown as StoredRecord)
    await get().load()
    return id
  },

  patchConfig: async (id, patch) => {
    const stack = get().stacks.find((s) => s.id === id)
    if (!stack) return
    await get().save({ ...stack, config: { ...stack.config, ...patch } })
  },

  rename: async (id, name) => {
    const stack = get().stacks.find((s) => s.id === id)
    if (stack) await get().save({ ...stack, name })
  },

  create: async (name) => {
    const taken = (n: string) => get().stacks.some((s) => s.name === n)
    let pick = name ?? 'Stack'
    for (let n = 2; taken(pick); n++) pick = `${name ?? 'Stack'} ${n}`
    return get().save(newPostStack(pick))
  },

  duplicate: async (id) => {
    const source = get().stacks.find((s) => s.id === id)
    if (!source) return id
    const copy = { ...newPostStack(`${source.name} copy`), config: structuredClone(source.config) }
    return get().save(copy)
  },

  // ponytail: reads every chat row. postStackId is unindexed and this runs on one screen, on
  // demand. Index it if the count ever needs to be live.
  usage: async () => {
    const counts: Record<number, number> = {}
    for (const chat of (await storage.getAll('chats')) as unknown as { postStackId?: number }[]) {
      if (chat.postStackId != null) counts[chat.postStackId] = (counts[chat.postStackId] ?? 0) + 1
    }
    return counts
  },

  remove: async (id) => {
    await storage.remove('postStacks', id)
    await get().load()
    // A chat pointing at the deleted stack is left alone: `resolvePostStack` already falls through.
    if (useSettings.getState().agent.defaultStackId === id) {
      useSettings.getState().setAgent({ defaultStackId: get().stacks[0]?.id ?? null })
    }
  },
}))
