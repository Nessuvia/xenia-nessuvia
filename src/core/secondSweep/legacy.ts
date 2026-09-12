// Extension-ful imports on purpose: checkLegacy.ts runs this under
// `node --experimental-strip-types`. Nothing here may reach the store or Dexie; the side-effecting
// half lives in `stores/importLegacyPass.ts`.
import type { GrammarHammerRule } from '../hammer/rule.ts'
import type { CensusOptions } from '../quality/census.ts'
import type { QualitySettings } from '../quality/decide.ts'
import type { LexiconEntry } from '../quality/lexicon.ts'
import { resolveDetect, type TextRule } from './detectSettings.ts'
import {
  newPipeline,
  newStage,
  type CleanStage,
  type Pipeline,
  type RewriteStage,
  type ScoreStage,
  type Stage,
} from './pipeline.ts'

/**
 * Reading a 0.0.42 install into 0.0.43.
 *
 * Second Pass and Gold Pass were two features with two settings blobs, and they are one pipeline
 * now. Nothing else in the app reads those blobs: this is the only code that knows their shape.
 * The interfaces below are copies of the deleted ones, kept here rather than anywhere a live code
 * path could reach them.
 *
 * The conversion is faithful rather than tidy. The two features stacked at run time (Second Pass
 * edited the reply, then Gold Pass rewrote what it produced), so the stages come out in that order,
 * and `skipWhenClean` lands on the clean stage rather than becoming a gate: a gate stops the whole
 * pipeline, and the old flag only ever skipped the edit request while Gold Pass ran regardless.
 */

/** The 0.0.42 `settings.secondPass` blob. */
export interface LegacySecondPass {
  enabled?: boolean
  connectionId?: string | null
  skipWhenClean?: boolean
  userPrompt?: string
  /** Write mode only, and Write has no pass now. Read so the shape is documented, never used. */
  passBeats?: boolean
  rules?: GrammarHammerRule[]
  textRules?: TextRule[]
  punctuation?: { dashes?: boolean; quotes?: boolean }
}

/** The 0.0.42 `settings.goldPass` blob. */
export interface LegacyGoldPass {
  enabled?: boolean
  connectionId?: string
  presets?: Array<{ id: string; label: string; text: string }>
  presetId?: string
  historyCount?: number
  includeCharacter?: boolean
  minRatio?: number
  maxRatio?: number
  quality?: QualitySettings
  lexicon?: LexiconEntry[]
  census?: CensusOptions
  promptBannedList?: boolean
  samplerBannedList?: boolean
}

/** What a 0.0.42 message carried. All four arrays are parallel to `swipes`. */
export interface LegacyMessageFields {
  /** Second Pass's pre-edit text. */
  drafts?: (string | undefined)[]
  /** Gold Pass's pre-rewrite text, which is Second Pass's *output* where both ran. */
  goldOriginals?: (string | undefined)[]
  goldFailed?: (string | undefined)[]
  goldSummaries?: (string | undefined)[]
}

/** The new arrays, for a message that carried the old ones. */
export interface PassArrays {
  passOriginals: (string | undefined)[]
  passSummaries: (string | undefined)[]
  passFailed: (string | undefined)[]
}

export interface ConvertedPipelines {
  pipelines: Pipeline[]
  /** Index of the one the old settings were pointing at, or -1 when there is nothing to point at. */
  activeIndex: number
  /** Old Gold Pass preset id to the index of the pipeline built from it, so a chat that overrode
   *  the preset can be pointed at the same pipeline. */
  byPresetId: Record<string, number>
}

function hasSecondPass(second: LegacySecondPass | undefined): second is LegacySecondPass {
  if (!second) return false
  // A blob that only ever held defaults is not a setup worth importing as a stage. Anything the
  // user actually authored, or ever switched on, is.
  return (
    !!second.enabled ||
    !!second.rules?.length ||
    !!second.textRules?.length ||
    !!second.userPrompt?.trim()
  )
}

function cleanStage(second: LegacySecondPass): CleanStage {
  const stage = newStage('clean') as CleanStage
  return {
    ...stage,
    config: {
      ...stage.config,
      connectionId: second.connectionId ?? null,
      userPrompt: second.userPrompt ?? '',
      skipWhenClean: second.skipWhenClean ?? true,
    },
  }
}

function rewriteStage(gold: LegacyGoldPass, preset: string, label: string): RewriteStage {
  const stage = newStage('rewrite') as RewriteStage
  return {
    ...stage,
    label,
    config: {
      ...stage.config,
      connectionId: gold.connectionId ?? '',
      preset,
      historyCount: gold.historyCount ?? stage.config.historyCount,
      includeCharacter: gold.includeCharacter ?? stage.config.includeCharacter,
      promptBannedList: gold.promptBannedList ?? stage.config.promptBannedList,
      samplerBannedList: gold.samplerBannedList ?? stage.config.samplerBannedList,
    },
  }
}

function scoreStage(gold: LegacyGoldPass): ScoreStage {
  const stage = newStage('score') as ScoreStage
  return {
    ...stage,
    config: {
      ...stage.config,
      minRatio: gold.minRatio ?? stage.config.minRatio,
      maxRatio: gold.maxRatio ?? stage.config.maxRatio,
      // The old `quality.enabled: false` meant "take the rewrite whole", and `decideRewrite` still
      // reads it that way. The stage is kept rather than dropped. Deleting it would look the
      // same today and silently lose the length guard, which ran either way.
      quality: gold.quality ?? stage.config.quality,
    },
  }
}

/**
 * Both old blobs into pipelines.
 *
 * One pipeline per Gold Pass preset, because a preset was the thing a chat could override and a
 * pipeline is what overrides it now. Every one of them carries the same Second Pass clean stage in
 * front, which is how the two ran together. With no presets there is a single clean-only pipeline,
 * and with neither blob there is nothing to import.
 */
export function pipelinesFromLegacy(
  second: LegacySecondPass | undefined,
  gold: LegacyGoldPass | undefined,
): ConvertedPipelines {
  const withSecond = hasSecondPass(second)
  const presets = (gold?.presets ?? []).filter((p) => p?.text?.trim())
  if (!withSecond && !presets.length) return { pipelines: [], activeIndex: -1, byPresetId: {} }

  // Only the three that survive. A 0.0.42 blob also carried repetition, sprawl and triplet
  // settings; those checks are gone, so the numbers behind them are dropped rather than written
  // onto a record as fields nothing reads.
  const detect = resolveDetect({
    rules: second?.rules ?? [],
    textRules: second?.textRules ?? [],
    punctuation: { ...newPipeline().detect.punctuation, ...second?.punctuation },
  })
  const shared = {
    detect,
    lexicon: gold?.lexicon ?? [],
    census: gold?.census ?? newPipeline().census,
  }

  // Built fresh per pipeline rather than shared: two pipelines holding the same stage object would
  // edit each other, and the ids have to differ anyway.
  const head = (): Stage[] => (withSecond ? [cleanStage(second)] : [])

  const pipelines: Pipeline[] = []
  const byPresetId: Record<string, number> = {}

  if (!presets.length) {
    pipelines.push({
      ...newPipeline('Second Pass (imported)'),
      ...shared,
      description: 'Imported from 0.0.42.',
      stages: head(),
    })
    return { pipelines, activeIndex: 0, byPresetId }
  }

  for (const preset of presets) {
    byPresetId[preset.id] = pipelines.length
    const label = preset.label.trim() || 'Preset'
    pipelines.push({
      ...newPipeline(`${label} (imported)`),
      ...shared,
      description: 'Imported from 0.0.42.',
      stages: [...head(), rewriteStage(gold!, preset.text, label), scoreStage(gold!)],
    })
  }

  // The preset that was selected. A `presetId` naming one that was already deleted was not running
  // anything: it falls back to the first rather than inventing a choice the user never made.
  const active = gold?.presetId ? byPresetId[gold.presetId] : undefined
  return { pipelines, activeIndex: active ?? 0, byPresetId }
}

/** Whether the old settings were passing replies at all, for the new global toggle. */
export function legacyEnabled(
  second: LegacySecondPass | undefined,
  gold: LegacyGoldPass | undefined,
): boolean {
  return !!second?.enabled || !!gold?.enabled
}

/**
 * A message's four old arrays into the three new ones.
 *
 * `passOriginals` is what the *writing* model said. A swipe that went through both passes takes
 * its draft: Second Pass ran first, which makes `goldOriginals` the text after it rather than
 * before. Where only one of the two ran, whichever exists is that text.
 *
 * Returns null when the message carried nothing, so a sweep can skip the write.
 */
export function passArraysFrom(message: LegacyMessageFields): PassArrays | null {
  const { drafts, goldOriginals, goldFailed, goldSummaries } = message
  if (!drafts && !goldOriginals && !goldFailed && !goldSummaries) return null

  const length = Math.max(
    drafts?.length ?? 0,
    goldOriginals?.length ?? 0,
    goldFailed?.length ?? 0,
    goldSummaries?.length ?? 0,
  )
  const passOriginals: (string | undefined)[] = new Array(length)
  for (let i = 0; i < length; i++) passOriginals[i] = drafts?.[i] ?? goldOriginals?.[i]

  // Dense, not sparse: setting `.length` on a short array leaves holes, and a hole and an
  // `undefined` are the same thing to every reader here but different things to `structuredClone`,
  // which is what IndexedDB stores these with.
  const pad = (arr: (string | undefined)[] | undefined) =>
    Array.from({ length }, (_, i) => arr?.[i])
  return { passOriginals, passSummaries: pad(goldSummaries), passFailed: pad(goldFailed) }
}
