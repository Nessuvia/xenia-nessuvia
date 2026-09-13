// Extension-ful imports on purpose: checkStageSummary.ts runs this under
// `node --experimental-strip-types`. Pure: no React, no store.
import type { Pipeline, Stage } from '../../../core/secondSweep/pipeline.ts'
import { defaultQuality } from '../../../core/quality/decide.ts'
import { standingRules } from '../../../core/secondSweep/rules.ts'

/** Resolves a connection id to the name the user gave it. Passed in rather than read from the
 *  store, which is what keeps this file pure and checkable. */
export type ConnectionName = (id: string | null) => string

/**
 * The one line a node shows under its title.
 *
 * The diagram's whole job is being readable without clicking, so each kind reports the settings
 * that decide what it does, not every setting it has. A card that listed six numbers would be the
 * wall this replaced, one node at a time.
 */
export function stageSummary(stage: Stage, connectionName: ConnectionName): string {
  switch (stage.kind) {
    case 'gate': {
      const { minNotes, standingCounts } = stage.config
      // 0 is worth saying outright: a gate set to 0 reads as configured but stops nothing.
      const needs = minNotes === 0 ? 'stops nothing' : `needs ${count(minNotes, 'problem')}`
      return standingCounts ? `${needs} · standing rules count` : needs
    }
    case 'clean': {
      const parts = [connectionName(stage.config.connectionId)]
      if (stage.config.skipWhenClean) parts.push('skip when clean')
      return parts.join(' · ')
    }
    case 'rewrite': {
      const parts = [connectionName(stage.config.connectionId || null)]
      parts.push(stage.config.preset.trim() ? 'preset written' : 'no preset')
      parts.push(`${count(stage.config.historyCount, 'turn')} of history`)
      return parts.join(' · ')
    }
    case 'score': {
      const { minRatio, maxRatio, quality } = stage.config
      const parts = [`length ${minRatio} to ${maxRatio}`]
      const tuned = Object.entries(quality.weights).filter(
        ([k, v]) => v !== defaultQuality.weights[k as keyof typeof defaultQuality.weights],
      ).length
      if (tuned > 0) parts.push(`${count(tuned, 'weight')} changed`)
      return parts.join(' · ')
    }
  }
}

/** What the Detectors node shows: the three inputs every stage below it reads. */
export function detectorsSummary(pipeline: Pipeline): string {
  const rules = pipeline.detect.rules.filter((r) => r.enabled)
  const standing = standingRules(pipeline.detect.rules, 'assistant').length
  const parts = [count(rules.length, 'rule')]
  if (standing > 0) parts.push(`${standing} standing`)
  if (pipeline.lexicon.length > 0) parts.push(count(pipeline.lexicon.length, 'phrase'))
  const { dashes, quotes } = pipeline.detect.punctuation
  if (dashes || quotes) parts.push('punctuation')
  return parts.join(' · ')
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}
