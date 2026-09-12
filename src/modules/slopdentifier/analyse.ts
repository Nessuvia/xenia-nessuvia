// Extension-ful imports on purpose: checkAnalyse.ts runs this under `node --experimental-strip-types`.
// Pure: no React, no store, no Dexie. Everything here is a composition of detectors that already
// exist, so a finding the Slop-dentifier shows is the same finding a pipeline would act on.
import { collectFindings } from '../../core/secondSweep/collect.ts'
import type { Note } from '../../core/secondSweep/note.ts'
import type { DetectSettings } from '../../core/secondSweep/detectSettings.ts'
import { findSlop, type LexiconEntry } from '../../core/quality/lexicon.ts'
import { buildCensus, defaultCensus, normalizeWords, type CensusEntry } from '../../core/quality/census.ts'
import { scoreText, type QualityScore } from '../../core/quality/score.ts'

/** Which detector produced a finding. Derived from `Note.source`, which is a free-text string with
 *  a prefix; the group is what the report sections on and what a chip shows. */
export type FindingGroup = 'hammer' | 'text' | 'slop' | 'standing'

export interface Finding extends Note {
  group: FindingGroup
}

export interface SlopStats {
  words: number
  /** Phrases the passage repeats against itself, longest and most-used first. */
  repeatedPhrases: CensusEntry[]
}

export interface SlopReport {
  /** The text after the hammer's strip/replace rules and the punctuation sweep. Spans index this,
   *  not what was pasted in. */
  cleaned: string
  /** Whether those mechanical edits changed anything. */
  edited: boolean
  findings: Finding[]
  stats: SlopStats
  score: QualityScore
}

function groupOf(source: string): FindingGroup {
  if (source.startsWith('hammer:')) return 'hammer'
  if (source.startsWith('text:') || source.startsWith('rule:')) return 'text'
  if (source.startsWith('slop:')) return 'slop'
  return 'standing'
}

function toFinding(note: Note, group?: FindingGroup): Finding {
  return { ...note, group: group ?? groupOf(note.source) }
}

export function buildStats(text: string): SlopStats {
  return {
    words: normalizeWords(text).length,
    // The census counts phrases across a chat's history; handed one passage it counts what that
    // passage repeats against itself, which is the stat this screen wants.
    repeatedPhrases: buildCensus([text], { ...defaultCensus, windowSize: 1 }).entries,
  }
}

/**
 * Everything the detectors can say about one passage, with nothing changed and nothing sent.
 *
 * The order is the order the report reads in: hammer flags, text rules, lexicon slop, then the
 * standing rules that apply to every passage. Everything with a span is a phrase, which is what
 * makes every finding here one a user can capture as a rule.
 */
export function analyseText(
  text: string,
  detect: DetectSettings,
  lexicon: LexiconEntry[],
): SlopReport {
  const { cleaned, edited, notes, standing } = collectFindings(text, detect, { role: 'assistant' })

  const findings = [
    ...notes.map((n) => toFinding(n)),
    ...findSlop(cleaned, lexicon).map((h) => toFinding(h, 'slop')),
    ...standing.map((n) => toFinding(n, 'standing')),
  ]

  const score = scoreText(cleaned, {
    // No chat behind this screen, so there is no history to build a census from. The census part
    // of the score is always 0 here; the other four carry it.
    census: buildCensus([], defaultCensus),
    lexicon,
    rules: detect.rules,
    role: 'assistant',
  })

  return { cleaned, edited, findings, stats: buildStats(cleaned), score }
}
