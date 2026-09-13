// Run: node --experimental-strip-types src/modules/settings/pipeline/checkStageSummary.ts
import assert from 'node:assert/strict'
import { stageSummary, detectorsSummary } from './stageSummary.ts'
import { newPipeline, newStage, type GateStage, type CleanStage, type RewriteStage, type ScoreStage } from '../../../core/secondSweep/pipeline.ts'
import { newRule } from '../../../core/secondSweep/rules.ts'

const name = (id: string | null) => (id ? `Conn ${id}` : 'Active connection')

// --- a gate says what stops the pipeline ----------------------------------
{
  const gate = newStage('gate') as GateStage
  assert.equal(stageSummary(gate, name), 'needs 1 problem · standing rules count')

  gate.config = { minNotes: 3, standingCounts: false }
  assert.equal(stageSummary(gate, name), 'needs 3 problems')

  // A gate at 0 is configured but stops nothing, which the card has to say rather than imply.
  gate.config = { minNotes: 0, standingCounts: false }
  assert.equal(stageSummary(gate, name), 'stops nothing')
}

// --- a clean stage names its connection ------------------------------------
{
  const clean = newStage('clean') as CleanStage
  // null is "whatever is active", not "unset". The summary must not read as a missing setting.
  assert.equal(stageSummary(clean, name), 'Active connection · skip when clean')

  clean.config = { connectionId: 'c1', userPrompt: '', skipWhenClean: false }
  assert.equal(stageSummary(clean, name), 'Conn c1')
}

// --- a rewrite stage shows whether it would run ----------------------------
{
  const rewrite = newStage('rewrite') as RewriteStage
  // A rewrite with no preset never runs, and that is the thing to see from the diagram.
  assert.equal(stageSummary(rewrite, name), 'Active connection · no preset · 5 turns of history')

  rewrite.config = { ...rewrite.config, connectionId: 'c2', preset: 'Rewrite it.', historyCount: 1 }
  assert.equal(stageSummary(rewrite, name), 'Conn c2 · preset written · 1 turn of history')
}

// --- a score stage counts only what was changed ----------------------------
{
  const score = newStage('score') as ScoreStage
  assert.equal(stageSummary(score, name), 'length 0.6 to 2')

  score.config = {
    ...score.config,
    minRatio: 0.5,
    quality: { ...score.config.quality, weights: { ...score.config.quality.weights, slop: 4, flags: 2 } },
  }
  assert.equal(stageSummary(score, name), 'length 0.5 to 2 · 2 weights changed')
}

// --- the source node counts the three shared inputs ------------------------
{
  const p = newPipeline('P')
  assert.equal(detectorsSummary(p), '0 rules · punctuation')

  const match = { ...newRule(), find: 'perhaps' }
  const standing = { ...newRule(), note: 'Never name an emotion.' }
  const off = { ...newRule(), find: 'x', enabled: false }
  p.detect.rules = [match, standing, off]
  p.lexicon = [{ id: 'l1', phrase: 'a beat passed', regex: false, enabled: true, weight: 1 }]
  // Disabled rules are left out of the count: the node describes what would run.
  assert.equal(detectorsSummary(p), '2 rules · 1 standing · 1 phrase · punctuation')

  p.detect.punctuation = { dashes: false, quotes: false }
  assert.equal(detectorsSummary(p), '2 rules · 1 standing · 1 phrase')
}

console.log('checkStageSummary ok')
