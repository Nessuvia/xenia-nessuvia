// Run: node --experimental-strip-types src/core/nessuPass/checkPipelineJson.ts
import assert from 'node:assert/strict'
import { exportPipelines, parsePipelineFile } from './pipelineJson.ts'
import { newPipeline, newStage, type RewriteStage } from './pipeline.ts'

const minimal = {
  label: 'Light',
  stages: [{ kind: 'clean', config: { skipWhenClean: false } }],
}

// --- the three shapes a person has to hand --------------------------------
{
  const bundle = parsePipelineFile(JSON.stringify({ format: 'nessuTavern.pipelines', pipelines: [minimal] }))
  const bare = parsePipelineFile(JSON.stringify([minimal]))
  const single = parsePipelineFile(JSON.stringify(minimal))
  for (const out of [bundle, bare, single]) {
    assert.equal(out.length, 1)
    assert.equal(out[0].label, 'Light')
    assert.equal(out[0].stages[0].kind, 'clean')
  }
}

// --- a half-written config is completed, not rejected ---------------------
{
  const [p] = parsePipelineFile(JSON.stringify(minimal))
  const stage = p.stages[0]
  assert.equal(stage.kind === 'clean' && stage.config.skipWhenClean, false) // what the file said
  assert.equal(stage.kind === 'clean' && stage.config.connectionId, null) // what it left out
  // Detectors too: a file with no `detect` block still resolves every check.
  assert.equal(p.detect.punctuation.dashes, true)
}

// --- ids are always fresh -------------------------------------------------
{
  const file = JSON.stringify({
    pipelines: [{ ...minimal, stages: [{ id: 'collides', kind: 'gate', config: {} }] }],
  })
  const a = parsePipelineFile(file)[0]
  const b = parsePipelineFile(file)[0]
  // Importing the same file twice must not produce two stages under one id.
  assert.notEqual(a.stages[0].id, b.stages[0].id)
  assert.notEqual(a.stages[0].id, 'collides')
}

// --- untrusted input is rejected whole ------------------------------------
{
  assert.throws(() => parsePipelineFile('not json'), /Not JSON/)
  assert.throws(() => parsePipelineFile(JSON.stringify({ pipelines: [] })), /No pipelines/)
  // No stages: a pipeline that does nothing is a typo, not a configuration.
  assert.throws(() => parsePipelineFile(JSON.stringify({ label: 'x', stages: [] })), /no stages/)
  // A stage kind this build does not have would run as something other than what its author wrote.
  assert.throws(
    () => parsePipelineFile(JSON.stringify({ ...minimal, stages: [{ kind: 'translate' }] })),
    /unknown kind/,
  )
  // A bad regex becomes a RegExp at run time, so it is caught here and names the rule.
  assert.throws(
    () =>
      parsePipelineFile(
        JSON.stringify({ ...minimal, detect: { textRules: [{ find: '([', regex: true, note: 'x' }] } }),
      ),
    /bad regex/,
  )
  // A hammer pattern is compiled here for the same reason: a silent no-match looks like an import
  // that worked.
  assert.throws(
    () =>
      parsePipelineFile(
        JSON.stringify({ ...minimal, detect: { rules: [{ pattern: '[nosuchtag]' }] } }),
      ),
    /bad pattern/,
  )
  // A rule with neither a find nor a note has nothing to match and nothing to say.
  assert.throws(
    () => parsePipelineFile(JSON.stringify({ ...minimal, detect: { textRules: [{ find: ' ' }] } })),
    /no find and no note/,
  )
}

// --- export drops this install's bookkeeping ------------------------------
{
  const p = newPipeline('Round trip')
  p.id = 7
  const rewrite = newStage('rewrite') as RewriteStage
  rewrite.config = { ...rewrite.config, connectionId: 'local-1', preset: 'Rewrite it.' }
  p.stages = [rewrite]

  const text = exportPipelines([p])
  const raw = JSON.parse(text)
  assert.equal(raw.pipelines[0].id, undefined)
  assert.equal(raw.pipelines[0].ownerId, undefined)
  assert.equal(raw.pipelines[0].updatedAt, undefined)

  const [back] = parsePipelineFile(text)
  assert.equal(back.label, 'Round trip')
  assert.equal(back.id, undefined)
  const stage = back.stages[0] as RewriteStage
  assert.equal(stage.config.preset, 'Rewrite it.')
  // The connection id survives, because it is part of the setup the author wrote. It will not
  // resolve in someone else's install, and `rewriteConnection` treats that as not armed.
  assert.equal(stage.config.connectionId, 'local-1')
}

console.log('checkPipelineJson ok')
