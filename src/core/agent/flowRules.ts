// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import { computeExclusions, type IgnorePair } from '../hammer/exclusions.ts'
import { quotedRanges } from '../quality/temperature.ts'
import { sentences, type Sentence } from '../quality/sentences.ts'
import { bodyBeats } from './flow/bodyBeats.ts'
import { crossRepeats } from './flow/crossRepeats.ts'
import { flatRhythm } from './flow/flatRhythm.ts'
import { fillerBeats } from './flow/fillerBeats.ts'
import { narrationRatio } from './flow/narrationRatio.ts'
import { repeatedOpeners } from './flow/repeatedOpeners.ts'
import { repeatedVerbs } from './flow/repeatedVerbs.ts'
import { staccatoRuns } from './flow/staccatoRuns.ts'

/** The shape a reply should have. Part of the stack, so one set of detectors serves any RP style. */
export interface FlowStyle {
  /** Share of words outside quoted speech, as [min, max]. */
  narrationRatio: [number, number]
  /** Narration sentences about a body part or a small movement allowed per reply. */
  bodyBeatsPerReply: number
  /** Very short sentences in a row before it counts as a staccato run. */
  staccatoRun: number
  /** How far each reply's narration range may slide, as a share of its width. 0 holds every reply to the range as set. */
  noise: number
}

/** Message detectors. Code-defined; the config turns them on and off. */
export interface FlowConfig {
  enabled: boolean
  /** Detector ids turned off. */
  off: string[]
}

export const defaultFlowStyle: FlowStyle = { narrationRatio: [0, 0.35], bodyBeatsPerReply: 2, staccatoRun: 2, noise: 0.25 }
export const defaultFlowConfig: FlowConfig = { enabled: true, off: [] }

export interface FlowContext {
  /** Sentences of the whole reply, offsets into it. */
  sents: Sentence[]
  quoted: [number, number][]
  style: FlowStyle
}

export interface FlowHit {
  ruleId: string
  /** Offsets into the reply. The span is what the fix prompt rewrites. */
  start: number
  end: number
  note: string
}

export interface FlowRule {
  id: string
  label: string
  description: string
  check(text: string, ctx: FlowContext): FlowHit[]
}

/** In fix order. A reply-wide count like the ratio goes last, after smaller fixes have moved it. */
export const flowRules: FlowRule[] = [staccatoRuns, fillerBeats, repeatedOpeners, repeatedVerbs, crossRepeats, bodyBeats, flatRhythm, narrationRatio]

/** The detectors' hits over a whole reply, in fix order. Hits inside ignored spans are dropped. */
export function findFlowHits(text: string, config: FlowConfig, style: FlowStyle, ignore: IgnorePair[] = []): FlowHit[] {
  if (!config.enabled || !text.trim()) return []
  const ctx: FlowContext = { sents: sentences(text), quoted: quotedRanges(text), style }
  const zones = ignore.length ? computeExclusions(text, ignore) : []
  return flowRules
    .filter((r) => !config.off.includes(r.id))
    .flatMap((r) => r.check(text, ctx).sort((a, b) => a.start - b.start))
    .filter((h) => !zones.some(([from, to]) => h.start < to && h.end > from))
}

/** The words inside quotes, in order, lowercased. Punctuation and how the lines are split drop out. */
function spokenWords(text: string): string {
  return quotedRanges(text)
    .flatMap(([s, e]) => text.slice(s + 1, e - 1).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu) ?? [])
    .join(' ')
}

/**
 * A detector fix may reshape narration but not what is said: the spoken words come back in the same
 * order, none dropped or added. Punctuation inside speech may change, so "You could've. Easily."
 * can become "You could've, easily." Rewording speech is the dialogue pass's job.
 * ponytail: a tag doubled outside the quotes ("morning," he said. ... he said) still passes. The
 * narration-only spans are what keep that from happening.
 */
export function keepsSpeech(passage: string, candidate: string): boolean {
  return spokenWords(passage) === spokenWords(candidate)
}

const minEchoWords = 5
const echoOverlap = 0.6

function wordSet(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu) ?? [])
}

/** Shared words over all words, for two sentences' word sets. */
function overlap(a: Set<string>, b: Set<string>): number {
  let shared = 0
  for (const w of a) if (b.has(w)) shared++
  return shared / (a.size + b.size - shared)
}

/**
 * A rewrite that repeats itself or copies the reply around it. Seen live: the model handed back two
 * takes of one sentence back to back ("He let out a rough laugh... He gave a rough laugh..."), and
 * replaced a paragraph with a copy of a later one it was shown as context.
 * A sentence under five words never counts: short lines repeat on purpose.
 * ponytail: word-set overlap, not order. Two different sentences built from the same words trip it;
 * raise `echoOverlap` if that shows up.
 */
export function echoes(candidate: string, rest: string): boolean {
  const own = sentences(candidate).map((s) => wordSet(s.text)).filter((w) => w.size >= minEchoWords)
  const others = sentences(rest).map((s) => wordSet(s.text)).filter((w) => w.size >= minEchoWords)
  return own.some((a, i) => own.slice(i + 1).some((b) => overlap(a, b) >= echoOverlap) || others.some((b) => overlap(a, b) >= echoOverlap))
}

/**
 * A rewrite that brings in speech its source didn't have. Rule rewrites may reword dialogue (slop
 * lives there too), so `keepsSpeech` is too strict for them; this only stops new lines. New speech,
 * even when the chat context grounds it, is the dialogue pass's to add.
 */
export function addsSpeech(source: string, candidate: string): boolean {
  return quotedRanges(candidate).length > quotedRanges(source).length
}
