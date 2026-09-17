// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { Rule } from './rules.ts'
import type { LexiconEntry } from '../quality/lexicon.ts'
import { defaultLintConfig, type LintConfig } from './lintRules.ts'
import { defaultVadLimits, type VadLimits } from './vadGuard.ts'
import { defaultFlowConfig, defaultFlowStyle, type FlowConfig, type FlowStyle } from './flowRules.ts'
import type { IgnorePair } from '../hammer/exclusions.ts'
import { defaultRules } from './agentConfig.ts'

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
    swaps: { enabled: true, lexicon: [] },
    lint: { ...defaultLintConfig },
    flow: { ...defaultFlowConfig, off: [] },
    style: { ...defaultFlowStyle, narrationRatio: [...defaultFlowStyle.narrationRatio] },
    rules: { enabled: true, list: defaultRules() },
    ignore: { enabled: false, pairs: defaultIgnorePairs(), useTagRules: true },
    maxTries: 3,
    contextMessages: 4,
    flowPass: { ...defaultFlowPassConfig },
    dialoguePass: { enabled: true },
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
