import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { Chat } from '../storage/types'
import { newPipeline, resolvePipeline, type Pipeline } from '../secondSweep/pipeline'
import { resolveSecondSweep, type SecondSweepSettings } from '../secondSweep/resolve'
import { useSettings } from './settingsStore'

/**
 * The pipeline library: every Second Sweep pipeline this install has, loaded once.
 *
 * A table rather than an array inside settings, because a pipeline is a document. It gets named,
 * duplicated, exported, traded and picked per chat, and none of that is comfortable inside a
 * settings blob that the whole app rewrites on every unrelated toggle.
 *
 * Nothing is seeded and nothing ships. A pipeline is written here, imported from a file, or built
 * a rule at a time from the Slop-dentifier.
 */
interface PipelineState {
  pipelines: Pipeline[]
  loaded: boolean
  load(): Promise<void>
  /** Returns the new row's id. */
  create(pipeline?: Pipeline): Promise<number>
  update(id: number, patch: Partial<Pipeline>): Promise<void>
  remove(id: number): Promise<void>
}

export const usePipelines = create<PipelineState>()((set, get) => ({
  pipelines: [],
  loaded: false,

  load: async () => {
    const rows = (await storage.getAll('pipelines')) as unknown as Pipeline[]
    set({ pipelines: rows.map(resolvePipeline), loaded: true })
  },

  create: async (pipeline = newPipeline('New pipeline')) => {
    const { id: _id, ...fields } = pipeline
    const id = await storage.put('pipelines', {
      ...fields,
      ownerId: currentOwnerId(),
      updatedAt: Date.now(),
    } as unknown as StoredRecord)
    await get().load()
    return id
  },

  update: async (id, patch) => {
    const current = get().pipelines.find((p) => p.id === id)
    if (!current) return
    const next = { ...current, ...patch, id, ownerId: currentOwnerId(), updatedAt: Date.now() }
    set({ pipelines: get().pipelines.map((p) => (p.id === id ? next : p)) })
    await storage.put('pipelines', next as unknown as StoredRecord)
  },

  remove: async (id) => {
    await storage.remove('pipelines', id)
    // The setting keeps pointing at a row that is gone, which resolves to "nothing runs". Left
    // rather than cleared: a user who deletes a pipeline by accident and imports it back expects
    // their chats to still name it, and a stale id costs nothing until then.
    await get().load()
  },
}))

/** The library outside React, for the send path, which reads it once per reply. */
export function pipelineList(): Pipeline[] {
  return usePipelines.getState().pipelines
}

/** Global settings with this chat's override on top. A chat with no override inherits global. */
export function secondSweepFor(chat: Chat | null | undefined): SecondSweepSettings {
  return resolveSecondSweep(useSettings.getState().secondSweep, chat?.secondSweep)
}

/** The pipeline a chat would run, or undefined when none is chosen or the chosen one is gone. */
export function pipelineFor(chat: Chat | null | undefined): Pipeline | undefined {
  const { pipelineId } = secondSweepFor(chat)
  if (pipelineId == null) return undefined
  return pipelineList().find((p) => p.id === pipelineId)
}
