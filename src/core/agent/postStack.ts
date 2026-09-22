// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { Rule } from './rules.ts'
import type { LexiconEntry } from '../quality/lexicon.ts'
import { defaultLintConfig, type LintConfig } from './lintRules.ts'
import { defaultVadLimits, type VadLimits } from './vadGuard.ts'
import { defaultFlowConfig, defaultFlowStyle, type FlowConfig, type FlowStyle } from './flowRules.ts'
import type { IgnorePair } from '../hammer/exclusions.ts'
import { defaultRules } from './agentConfig.ts'
import type { Sensor } from '../sensors/sensor.ts'
import type { Gate } from '../sensors/gate.ts'
import { libraryGates, librarySensors } from '../sensors/library.ts'

/** How a reply's shape is drawn before it's written. Filled in by Part B; the stage exists here so
 *  a stack saved today keeps its switch. */
export interface AcrosticConfig {
  enabled: boolean
  paragraphs: [number, number]
  sentencesPerParagraph: [number, number]
  beatSlots: number
  jsonMode: boolean
}

/**
 * Everything the pass does, as one shareable unit. A chat picks a stack; the global config holds
 * only what must not travel (the master switch, the style, and the connection with its key).
 * Each stage carries its own switch, so a stack can be half off without losing its contents.
 */
export interface PostStackConfig {
  acrostic: AcrosticConfig
  swaps: { enabled: boolean; lexicon: LexiconEntry[] }
  lint: LintConfig
  /** Message detectors: code finds the problem, a small prompt fixes the passage. After rules. */
  flow: FlowConfig
  /** The reply shape the detectors hold replies to. */
  style: FlowStyle
  rules: { enabled: boolean; list: Rule[] }
  /** Text the whole pass leaves alone, on top of the code spans and URLs it always skips. Not a
   *  stage: it applies to every stage rather than running in turn. `useTagRules` adds the global
   *  Tags from Settings, so a tag set up once isn't written out again here. */
  ignore: { enabled: boolean; pairs: IgnorePair[]; useTagRules: boolean }
  /** Failed rewrites allowed per sentence or paragraph before the original stays. */
  maxTries: number
  /** Recent chat messages sent with each rewrite, so a fix fits the scene. 0 sends none. */
  contextMessages: number
  /** One call over the whole finished reply for transitions and rhythm. Always runs while the pass is on. */
  flowPass: FlowPassConfig
  /** One call that makes speech sound spoken and answer the last message. Runs last, after the flow pass. */
  dialoguePass: { enabled: boolean }
  /** Typed questions put to a decisions model before the cleanup runs. Read by `runTrack`, not `runAgent`. */
  sensors: { enabled: boolean; list: Sensor[] }
  /** What a reading does: ask the model again, or turn cleanup stages on and off for this reply. */
  gates: { enabled: boolean; list: Gate[] }
  /** Retries a gate may ask for on one reply. The best-scoring attempt is kept. 0 never retries. */
  retryCap: number
}

export interface FlowPassConfig extends VadLimits {
  /** Sentence count may change by this fraction of the reply's sentences, and always by one. */
  sentenceDrift: number
}

export const defaultFlowPassConfig: FlowPassConfig = { ...defaultVadLimits, sentenceDrift: 0.2 }

/** Seeded, not enabled. Turning the stage on is what starts skipping these, so an existing stack
 *  doesn't silently change what it matches. */
export function defaultIgnorePairs(): IgnorePair[] {
  return [
    { id: 'square', open: '[', close: ']' },
    { id: 'think', open: '<think>', close: '</think>' },
  ]
}

/**
 * Seeded word swaps. Every one is a deletion: the narrator labelling an action as chosen or an
 * emotion as visible, instead of showing either. Adverbs only, because an -ly form deletes cleanly
 * after a verb and a bare adjective leaves "the movement was." The adjective half of the same tic
 * is `default-intent-adjective`, which needs the word after it to decide.
 *
 * The 23 words `intensifierBudget` already holds are deliberately absent. A budget that scales with
 * scene heat beats a blanket delete, and an entry here would pre-empt it.
 */
export function defaultLexicon(): LexiconEntry[] {
  return [
    // On purpose, said out loud.
    'deliberately', 'purposefully', 'intentionally', 'consciously', 'pointedly',
    // The narrator insisting a feeling was visible rather than describing it.
    'visibly', 'noticeably', 'perceptibly', 'markedly', 'distinctly',
    // Narrator confidence. `apparently` is not here: it can report secondhand knowledge, which is
    // information, so it sits in the hedge budget instead.
    'decidedly', 'plainly', 'evidently',
  ].map((phrase) => ({ id: `lex-${phrase}`, phrase, replacement: '', enabled: true }))
}

export const defaultAcrosticConfig: AcrosticConfig = {
  enabled: false,
  paragraphs: [2, 4],
  sentencesPerParagraph: [2, 5],
  beatSlots: 1,
  jsonMode: false,
}

/** The stack seeded on first run, and the fallback when a chat names a stack that's gone. */
export function defaultPostStackConfig(): PostStackConfig {
  return {
    acrostic: { ...defaultAcrosticConfig },
    swaps: { enabled: true, lexicon: defaultLexicon() },
    // On and fixing: the three checks did nothing for anyone who never found the switch.
    lint: { ...defaultLintConfig, enabled: true, mode: 'fix' },
    flow: { ...defaultFlowConfig, off: [] },
    // 0 to 50%: the old 0 to 35% ceiling pushed hard toward dialogue.
    style: { ...defaultFlowStyle, narrationRatio: [0, 0.5] },
    rules: { enabled: true, list: defaultRules() },
    ignore: { enabled: false, pairs: defaultIgnorePairs(), useTagRules: true },
    maxTries: 3,
    contextMessages: 4,
    flowPass: { ...defaultFlowPassConfig },
    dialoguePass: { enabled: true },
    sensors: { enabled: false, list: librarySensors() },
    gates: { enabled: false, list: libraryGates() },
    retryCap: 1,
  }
}

/**
 * What `runAgent` and `explainAgent` read. Flat on purpose: the engine knows nothing about stages
 * or switches, and `runStages` is the one place a switch turns into an empty list.
 */
export interface AgentRun {
  maxTries: number
  rules: Rule[]
  lexicon: LexiconEntry[]
  lint?: LintConfig
  /** Absent when the detector stage is off. */
  flow?: { off: string[]; style: FlowStyle }
  /** Spans nothing may touch. Empty when the stack isn't ignoring anything. */
  ignore?: IgnorePair[]
  /** Recent chat as plain text, built by the caller from `contextMessages`. Absent sends none. */
  context?: string
  /** The message this reply answers, for the flow pass's VAD guard. */
  lastMessage?: string
  /** Absent skips the flow pass: clean only, which makes no calls. */
  flowPass?: FlowPassConfig
  /** Absent skips the dialogue pass. Its VAD guard reads `flowPass`'s limits. */
  dialoguePass?: boolean
}

/**
 * A stack's config with its stage switches applied. An off stage contributes nothing.
 *
 * `tagRules` is the global Tags list from Settings, passed in rather than read: this file is pure
 * and the check scripts import it. Only `open` and `close` are used, so a `TagRule` fits as it is.
 */
export function runStages(config: PostStackConfig, tagRules: IgnorePair[] = []): AgentRun {
  return {
    maxTries: config.maxTries,
    rules: config.rules.enabled ? config.rules.list : [],
    lexicon: config.swaps.enabled ? config.swaps.lexicon : [],
    lint: config.lint,
    // A stack saved before the stage existed has no `flow`: it gets the default, the same one the editor shows.
    flowPass: config.flowPass ?? defaultFlowPassConfig,
    dialoguePass: config.dialoguePass?.enabled ?? true,
    flow: (config.flow ?? defaultFlowConfig).enabled ? { off: config.flow?.off ?? [], style: config.style ?? defaultFlowStyle } : undefined,
    ignore: config.ignore.enabled
      ? [...config.ignore.pairs, ...(config.ignore.useTagRules ? tagRules : [])]
      : [],
  }
}

/** Only the fields resolution needs, so this file stays out of the storage types. */
interface StackLike {
  id?: number
  config: PostStackConfig
}

/**
 * The stack a chat runs: its own, then the global default, then the built-in.
 * Falls through the same way when either id names a stack that has since been deleted, so a
 * delete never leaves a chat with no pass at all.
 */
export function resolvePostStack(
  chatStackId: number | undefined,
  defaultStackId: number | null | undefined,
  stacks: StackLike[],
): PostStackConfig {
  return resolvePostStackRow(chatStackId, defaultStackId, stacks)?.config ?? defaultPostStackConfig()
}

/** The stored stack `resolvePostStack` reads, or undefined when it falls back to the built-in. What
 *  a write aimed at "this chat's stack" targets. */
export function resolvePostStackRow<S extends StackLike>(
  chatStackId: number | undefined,
  defaultStackId: number | null | undefined,
  stacks: S[],
): S | undefined {
  const byId = (id: number | null | undefined) =>
    id == null ? undefined : stacks.find((s) => s.id === id)
  return byId(chatStackId) ?? byId(defaultStackId)
}
