import { storage } from '../storage/db'
import type { StoredRecord } from '../storage/storageInterface'
import type { Chat, Message } from '../storage/types'
import {
  legacyEnabled,
  passArraysFrom,
  pipelinesFromLegacy,
  type LegacyGoldPass,
  type LegacyMessageFields,
  type LegacySecondPass,
} from '../secondSweep/legacy'
import { usePipelines } from './pipelineStore'
import { useSettings } from './settingsStore'

/**
 * The 0.0.42 to 0.0.43 importer: Second Pass and Gold Pass into Second Sweep.
 *
 * Behind a button, like every other import. Nothing is lost by never pressing it: a 0.0.42 message
 * still displays, it just cannot show what it looked like before the pass ran until its arrays are
 * converted.
 *
 * Run once. There is no flag saying so: a flag would be wrong after restoring an old backup.
 * What marks the job done is that the old data is gone. That is checkable and survives anything.
 * `legacyPassFound` reads the same state the run clears.
 */
export interface ImportReport {
  pipelines: number
  messages: number
  chats: number
}

/** The settings blob's old fields. They survive rehydration: `persist` merges the stored object
 *  over the store's own state. Keys the current store does not declare are kept and written
 *  back. Read from the live state rather than parsing localStorage: a pending write cannot then make
 *  the two disagree. */
function legacySettings(): { second?: LegacySecondPass; gold?: LegacyGoldPass } {
  const state = useSettings.getState() as unknown as {
    secondPass?: LegacySecondPass
    goldPass?: LegacyGoldPass
  }
  return { second: state.secondPass, gold: state.goldPass }
}

/** Whether there is anything to import: old settings, or messages still carrying the old arrays. */
export async function legacyPassFound(): Promise<boolean> {
  const { second, gold } = legacySettings()
  if (second || gold) return true
  const messages = (await storage.getAll('messages')) as unknown as LegacyMessageFields[]
  return messages.some((m) => m.drafts || m.goldOriginals || m.goldFailed || m.goldSummaries)
}

export async function importLegacyPass(): Promise<ImportReport> {
  const { second, gold } = legacySettings()
  const report: ImportReport = { pipelines: 0, messages: 0, chats: 0 }

  // --- the two settings blobs into pipelines --------------------------------
  const { pipelines, activeIndex, byPresetId } = pipelinesFromLegacy(second, gold)
  const ids: number[] = []
  for (const pipeline of pipelines) ids.push(await usePipelines.getState().create(pipeline))
  report.pipelines = ids.length

  if (ids.length) {
    useSettings.getState().setSecondSweep({
      enabled: legacyEnabled(second, gold),
      pipelineId: ids[activeIndex] ?? ids[0],
    })
  }

  // --- per-chat overrides ---------------------------------------------------
  // Only the two things a chat can still say. The rest of the old override (its own connection,
  // its own ratios) has nowhere to go: those belong to a stage now, and silently forking a whole
  // pipeline per chat would leave a library nobody asked for.
  const chats = (await storage.getAll('chats')) as unknown as Chat[]
  for (const chat of chats) {
    const old = (chat as unknown as { goldPass?: LegacyGoldPass & { enabled?: boolean } }).goldPass
    if (!old || chat.id === undefined) continue
    const at = old.presetId !== undefined ? byPresetId[old.presetId] : undefined
    // `updatedAt` is left alone: the chat list sorts by it, and converting a setting is not the
    // user touching the chat. Importing would otherwise reorder every chat they own.
    const next = { ...chat } as Chat & { goldPass?: unknown }
    delete next.goldPass
    next.secondSweep = {
      ...(old.enabled === undefined ? {} : { enabled: old.enabled }),
      ...(at === undefined ? {} : { pipelineId: ids[at] }),
    }
    // An override that said nothing this version can express is dropped rather than stored empty:
    // an empty object and an absent one both mean "inherit global", and one of them reads as a
    // setting the user made.
    if (!Object.keys(next.secondSweep).length) delete next.secondSweep
    await storage.put('chats', next as unknown as StoredRecord)
    report.chats++
  }

  // --- per-message arrays ---------------------------------------------------
  const messages = (await storage.getAll('messages')) as unknown as Array<Message & LegacyMessageFields>
  for (const message of messages) {
    const arrays = passArraysFrom(message)
    if (!arrays || message.id === undefined) continue
    const next = { ...message, ...arrays } as Message & Partial<LegacyMessageFields>
    delete next.drafts
    delete next.goldOriginals
    delete next.goldFailed
    delete next.goldSummaries
    await storage.put('messages', next as unknown as StoredRecord)
    report.messages++
  }

  // --- forget the old shape -------------------------------------------------
  // Replace rather than patch: `set` merges, and a key can only be dropped by writing the whole
  // state without it. This is what makes the import one-shot and what `legacyPassFound` reads.
  const state = useSettings.getState() as unknown as Record<string, unknown>
  const { secondPass: _s, goldPass: _g, ...rest } = state
  useSettings.setState(rest as never, true)

  // Blocks carried `drafts` too, from Write's own pass. Write has no pass now: there is nothing
  // to convert them into, and they are left where they are. A Chapter's prose is in `content`,
  // and the field is simply never read again.
  await usePipelines.getState().load()
  return report
}
