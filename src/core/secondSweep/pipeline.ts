// Extension-ful imports on purpose: checkPipeline.ts and checkPipelineJson.ts run this under
// `node --experimental-strip-types`. Nothing here may reach the store or Dexie.
import { defaultQuality, type QualitySettings } from '../quality/decide.ts'
import { defaultCensus, type CensusOptions } from '../quality/census.ts'
import type { LexiconEntry } from '../quality/lexicon.ts'
import { resolveDetect, type DetectSettings } from './detectSettings.ts'

/**
 * Second Sweep: what happens to an assistant reply between the model finishing it and the app
 * storing it.
 *
 * A pipeline is data, not code. It is an ordered list of stages, each one of a fixed kind with a
 * config blob, so a new way of working a reply over is a JSON file rather than a release. That is
 * the whole reason the two features it replaces were merged: Second Pass was "check it and ask the
 * same model to fix what was flagged", Gold Pass was "hand it to a second model and score what
 * comes back", and both are the same shape with different stages in them.
 *
 * Stored in Dexie (`pipelines`), one record per pipeline, so a library can be built, exported and
 * traded. Which pipeline runs is a setting: global, with a per-chat override.
 */
export type StageKind = 'gate' | 'clean' | 'rewrite' | 'score'

interface StageBase {
  id: string
  label: string
  /** Off keeps the stage in the list and skips it. Editing a pipeline by deleting half of it and
   *  pasting it back is how a config gets lost. */
  enabled: boolean
}

/**
 * Decide whether the stages after it run at all.
 *
 * This is the "staged" part: a reply that trips nothing is not worth a second request, and the
 * gate is where that judgment is made explicitly rather than buried in a `skipWhenClean` flag on
 * one stage. A pipeline with no gate always runs every stage.
 */
export interface GateStage extends StageBase {
  kind: 'gate'
  config: {
    /** How many notes the detectors must produce before the rest of the pipeline runs. 0 means
     *  the gate never stops anything, which is how a user says "look at every reply". */
    minNotes: number
    /** A standing text rule (one with no `find`) counts as a reason to run even with nothing
     *  found. It says "look at every reply" in the rule author's words. */
    standingCounts: boolean
  }
}

/**
 * Mechanical edits, then a targeted edit request to the model that wrote the reply.
 *
 * The hammer's `strip` and `replace` rules and the punctuation sweep run with no request at all,
 * so text can change here for free. What is left over becomes notes, and the notes become one
 * request quoting the exact slices to fix.
 */
export interface CleanStage extends StageBase {
  kind: 'clean'
  config: {
    /** Which connection edits. null = whatever is active; see `resolveConnection`. */
    connectionId: string | null
    /** Appended to the built instruction. Non-empty, the request is made even with no notes. */
    userPrompt: string
    /** Skip the request when the detectors found nothing. The mechanical edits still run. */
    skipWhenClean: boolean
  }
}

/**
 * A second model, on a second connection, rewrites the passage whole.
 *
 * The window is deliberately slim: the preset, optionally the character's description, a fixed
 * count of recent turns, and the passage. It must never be the chat's own prompt stack. The point
 * is a small cheap model supplying voice while the first model supplies comprehension and memory.
 */
export interface RewriteStage extends StageBase {
  kind: 'rewrite'
  config: {
    /** Which connection rewrites. '' = the stage is not armed and does not run. Named outright
     *  with no fallback to the active connection: rewriting with the connection that just wrote
     *  the reply is the one thing this stage must not do silently. */
    connectionId: string
    /** The rewrite system prompt. Blank = not armed. */
    preset: string
    /** How many messages before the one being rewritten go in the window. */
    historyCount: number
    /** Put the character's description in the window. */
    includeCharacter: boolean
    /** Tell the rewriting model which phrases not to use. */
    promptBannedList: boolean
    /** Send the same list as `banned_strings`, on connections carrying that param. */
    samplerBannedList: boolean
  }
}

/**
 * Judge what the stage before it produced, and decide what is kept.
 *
 * Whole-message length ratio first, then per-paragraph scoring against the original, so a rewrite
 * that improved two paragraphs and wrecked a third contributes only the two. Without a score
 * stage, a rewrite is taken whole.
 */
export interface ScoreStage extends StageBase {
  kind: 'score'
  config: {
    /** Output/input character-length band for the whole message. Outside it the candidate is
     *  rejected before any per-chunk work happens. */
    minRatio: number
    maxRatio: number
    /** Weights, invariants and the accept threshold. See `core/quality/decide.ts`. */
    quality: QualitySettings
  }
}

export type Stage = GateStage | CleanStage | RewriteStage | ScoreStage

export interface Pipeline {
  /** Dexie's row id, assigned on insert. Absent on a pipeline that has not been saved yet, and
   *  stripped on export: an id means nothing in someone else's install. */
  id?: number
  label: string
  /** Free text the author writes for whoever imports the file. Not sent to any model. */
  description: string
  /** Shared by the gate, the clean stage and the score stage, so the three cannot disagree about
   *  what counts as a problem. */
  detect: DetectSettings
  /** Worn phrases this pipeline scores against. Nothing is shipped, so an empty list means the
   *  slop signal is off. Feeds the banned list and the score stage. */
  lexicon: LexiconEntry[]
  /** How the chat's own overused phrasing is counted. */
  census: CensusOptions
  stages: Stage[]
  ownerId: string
  updatedAt: number
}

export const defaultGateConfig: GateStage['config'] = { minNotes: 1, standingCounts: true }

export const defaultCleanConfig: CleanStage['config'] = {
  connectionId: null,
  userPrompt: '',
  skipWhenClean: true,
}

export const defaultRewriteConfig: RewriteStage['config'] = {
  connectionId: '',
  preset: '',
  historyCount: 5,
  includeCharacter: true,
  promptBannedList: true,
  samplerBannedList: true,
}

export const defaultScoreConfig: ScoreStage['config'] = {
  minRatio: 0.6,
  maxRatio: 2.0,
  quality: defaultQuality,
}

const stageLabels: Record<StageKind, string> = {
  gate: 'Gate',
  clean: 'Clean',
  rewrite: 'Rewrite',
  score: 'Score',
}

export function newStage(kind: StageKind): Stage {
  const base = { id: crypto.randomUUID(), label: stageLabels[kind], enabled: true }
  switch (kind) {
    case 'gate':
      return { ...base, kind, config: { ...defaultGateConfig } }
    case 'clean':
      return { ...base, kind, config: { ...defaultCleanConfig } }
    case 'rewrite':
      return { ...base, kind, config: { ...defaultRewriteConfig } }
    case 'score':
      return { ...base, kind, config: { ...defaultScoreConfig } }
  }
}

export function newPipeline(label = ''): Pipeline {
  return {
    label,
    description: '',
    detect: resolveDetect(),
    lexicon: [],
    census: defaultCensus,
    stages: [],
    ownerId: 'local',
    updatedAt: Date.now(),
  }
}

/** Defaults under a stored record, every nested shape included. A pipeline written before a field
 *  existed resolves every field, which is what keeps the runner free of undefined checks. */
export function resolvePipeline(stored: Partial<Pipeline>): Pipeline {
  return {
    ...newPipeline(),
    ...stored,
    detect: resolveDetect(stored.detect),
    lexicon: stored.lexicon ?? [],
    census: { ...defaultCensus, ...stored.census },
    stages: (stored.stages ?? []).map(resolveStage),
  }
}

export function resolveStage(stage: Stage): Stage {
  switch (stage.kind) {
    case 'gate':
      return { ...stage, config: { ...defaultGateConfig, ...stage.config } }
    case 'clean':
      return { ...stage, config: { ...defaultCleanConfig, ...stage.config } }
    case 'rewrite':
      return { ...stage, config: { ...defaultRewriteConfig, ...stage.config } }
    case 'score':
      return {
        ...stage,
        config: {
          ...defaultScoreConfig,
          ...stage.config,
          quality: {
            ...defaultQuality,
            ...stage.config?.quality,
            weights: { ...defaultQuality.weights, ...stage.config?.quality?.weights },
            invariants: { ...defaultQuality.invariants, ...stage.config?.quality?.invariants },
          },
        },
      }
  }
}

/** The stages that will actually do something, in order. */
export function activeStages(pipeline: Pipeline): Stage[] {
  return pipeline.stages.filter((s) => s.enabled)
}

/**
 * Whether the pipeline would change anything if it ran.
 *
 * A rewrite stage with no preset or no connection is not armed, and a pipeline whose only stages
 * are unarmed rewrites has nothing to do. Checked before running so a settings problem is never
 * recorded on a message as a failure.
 */
export function pipelineArmed(pipeline: Pipeline): boolean {
  return activeStages(pipeline).some((stage) => {
    if (stage.kind === 'rewrite') {
      return !!stage.config.connectionId && !!stage.config.preset.trim()
    }
    // A gate alone changes nothing, and a score stage with no candidate before it has nothing to
    // judge. Only a clean stage is worth running on its own: its mechanical edits need no model.
    return stage.kind === 'clean'
  })
}
