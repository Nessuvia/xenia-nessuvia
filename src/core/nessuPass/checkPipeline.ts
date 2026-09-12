// Run: node --experimental-strip-types src/core/nessuPass/checkPipeline.ts
import assert from 'node:assert/strict'
import {
  activeStages,
  newPipeline,
  newStage,
  pipelineArmed,
  resolvePipeline,
  resolveStage,
  type Pipeline,
  type RewriteStage,
  type ScoreStage,
  type Stage,
} from './pipeline.ts'
import { defaultNessuPass, resolveNessuPass } from './resolve.ts'

// --- stages carry the defaults for their kind -----------------------------
{
  const gate = newStage('gate')
  assert.equal(gate.kind, 'gate')
  assert.equal(gate.enabled, true)
  const clean = newStage('clean')
  assert.equal(clean.kind === 'clean' && clean.config.skipWhenClean, true)
  const rewrite = newStage('rewrite') as RewriteStage
  assert.equal(rewrite.config.historyCount, 5)
  const score = newStage('score') as ScoreStage
  assert.equal(score.config.maxRatio, 2)
  // Every stage gets its own config object, so editing one never edits another of the same kind.
  assert.notEqual(newStage('score').config, score.config)
}

// --- a half-written stage resolves every field ----------------------------
{
  // The shape a JSON file or an older record hands over: the kind, and a config missing most of it.
  const partial = { id: 'a', label: 'Score', enabled: true, kind: 'score', config: { minRatio: 0.9 } } as unknown as Stage
  const full = resolveStage(partial) as ScoreStage
  assert.equal(full.config.minRatio, 0.9)
  assert.equal(full.config.maxRatio, 2)
  // The nested shapes too: a missing weight would otherwise resolve undefined and score NaN.
  assert.equal(typeof full.config.quality.weights.slop, 'number')
  assert.equal(typeof full.config.quality.invariants.paragraphCount, 'boolean')
}

// --- a half-written pipeline resolves every field -------------------------
{
  const thin = resolvePipeline({ label: 'Thin' } as Partial<Pipeline>)
  assert.equal(thin.label, 'Thin')
  assert.deepEqual(thin.stages, [])
  assert.equal(thin.detect.repetition.phrase, 4)
  assert.equal(thin.detect.punctuation.dashes, true)
  assert.equal(thin.ownerId, 'local')
}

// --- disabled stages never run --------------------------------------------
{
  const p = newPipeline('p')
  const on = newStage('clean')
  const off = { ...newStage('rewrite'), enabled: false }
  p.stages = [on, off]
  assert.deepEqual(activeStages(p).map((s) => s.id), [on.id])
}

// --- armed: a settings problem is not a failed pass -----------------------
{
  const p = newPipeline('p')
  // Nothing at all.
  assert.equal(pipelineArmed(p), false)

  // A gate alone changes nothing, and a score stage with no candidate has nothing to judge.
  p.stages = [newStage('gate'), newStage('score')]
  assert.equal(pipelineArmed(p), false)

  // A rewrite with no connection and no preset is a settings problem, not a pass.
  p.stages = [newStage('rewrite')]
  assert.equal(pipelineArmed(p), false)

  // Half-armed is still not armed: both the connection and the preset have to be there.
  const half = newStage('rewrite') as RewriteStage
  half.config = { ...half.config, connectionId: 'c1' }
  p.stages = [half]
  assert.equal(pipelineArmed(p), false)
  const whitespace = { ...half, config: { ...half.config, preset: '   ' } }
  p.stages = [whitespace]
  assert.equal(pipelineArmed(p), false)

  // Armed.
  p.stages = [{ ...half, config: { ...half.config, preset: 'Rewrite it.' } }]
  assert.equal(pipelineArmed(p), true)

  // A clean stage is armed on its own: its strip rules and punctuation sweep need no model.
  p.stages = [newStage('clean')]
  assert.equal(pipelineArmed(p), true)

  // ...unless it is switched off.
  p.stages = [{ ...newStage('clean'), enabled: false }]
  assert.equal(pipelineArmed(p), false)
}

// --- the chat override sits on top of global ------------------------------
{
  assert.deepEqual(resolveNessuPass(undefined, undefined), defaultNessuPass)

  const global = { enabled: true, pipelineId: 3 }
  assert.deepEqual(resolveNessuPass(global, undefined), global)
  // A chat that only turns the pass off keeps the global pipeline.
  assert.deepEqual(resolveNessuPass(global, { enabled: false }), { enabled: false, pipelineId: 3 })
  // ...and one that only names a pipeline keeps the global toggle.
  assert.deepEqual(resolveNessuPass(global, { pipelineId: 9 }), { enabled: true, pipelineId: 9 })
  // An empty override object inherits both: undefined means "not said", not "off".
  assert.deepEqual(resolveNessuPass(global, {}), global)
  // false is a value, not an absence, so it has to win over a global true.
  assert.equal(resolveNessuPass({ enabled: true, pipelineId: 1 }, { enabled: false }).enabled, false)
}

console.log('checkPipeline ok')
