// Run: node --experimental-strip-types src/core/secondSweep/checkDefaultPipeline.ts
import assert from 'node:assert/strict'
import { defaultPipeline } from './defaultPipeline.ts'
import { collectFindings } from './collect.ts'
import { pipelineArmed, pipelineProblem, resolvePipeline } from './pipeline.ts'
import { compileRule } from './rules.ts'
import { tryCompile } from '../hammer/pattern.ts'
import { exportPipelines, parsePipelineFile } from './pipelineJson.ts'

const p = defaultPipeline()

// --- it shows every mode and every action, which is the whole point --------
{
  const modes = new Set(p.detect.rules.map((r) => r.match))
  const actions = new Set(p.detect.rules.map((r) => r.action))
  assert.deepEqual([...modes].sort(), ['literal', 'pattern', 'regex'])
  assert.deepEqual([...actions].sort(), ['flag', 'replace', 'strip'])
  // One rule with no find: the standing kind, which is the third thing a rule can be.
  assert.equal(p.detect.rules.filter((r) => !r.find).length, 1)
  // All four stage kinds, in run order.
  assert.deepEqual(p.stages.map((s) => s.kind), ['gate', 'clean', 'rewrite', 'score'])
  // Both lexicon shapes.
  assert.deepEqual(p.lexicon.map((e) => e.regex), [false, true])
}

// --- every rule compiles ---------------------------------------------------
{
  for (const r of p.detect.rules) {
    if (!r.find) continue
    if (r.match === 'pattern') {
      const compiled = tryCompile(r.find, r.caseSensitive)
      assert.ok(!('error' in compiled), `${r.label}: ${JSON.stringify(compiled)}`)
    } else {
      assert.ok(compileRule(r), `${r.label} does not compile`)
    }
  }
  // Ids are stable rather than random: two installs seeding this should agree.
  assert.ok(p.detect.rules.every((r) => r.id.startsWith('default-')))
  assert.equal(new Set(p.detect.rules.map((r) => r.id)).size, p.detect.rules.length)
}

// --- it runs, and each action does its half --------------------------------
{
  const text =
    'She smiled slightly and looked at him with a heavy heart. It was very quiet. Suddenly the door opened.'
  const out = collectFindings(text, p.detect)

  // replace: the verb survives, the hedge goes.
  assert.ok(out.cleaned.includes('She smiled and'), out.cleaned)
  // strip, pattern mode: no fixed string in "with a heavy heart".
  assert.ok(!out.cleaned.includes('heavy heart'), out.cleaned)
  // strip, regex mode, word-bounded.
  assert.ok(!/\bvery\b/.test(out.cleaned), out.cleaned)
  assert.equal(out.edited, true)

  // flag: reported rather than cut, so the text still holds the word.
  assert.ok(out.cleaned.includes('Suddenly'), out.cleaned)
  assert.ok(out.notes.some((n) => n.slice?.toLowerCase() === 'suddenly'), JSON.stringify(out.notes))
  // The standing rule is carried apart from the matches.
  assert.equal(out.standing.length, 1)
}

// --- "very" must not eat "every" ------------------------------------------
{
  const out = collectFindings('Every door was locked.', p.detect)
  assert.equal(out.cleaned, 'Every door was locked.')
  assert.equal(out.edited, false)
}

// --- it is armed, and reports no problem ----------------------------------
{
  // The clean stage alone arms it: its mechanical edits need no connection.
  assert.equal(pipelineArmed(p), true)
  assert.equal(pipelineProblem(p), '')
  // The rewrite ships off. An enabled stage with no connection would report a problem on a library
  // the user never touched.
  assert.equal(p.stages[2].enabled, false)
  assert.ok((p.stages[2] as { config: { preset: string } }).config.preset.trim())
}

// --- it survives a round trip through the file format ----------------------
{
  const [back] = parsePipelineFile(exportPipelines([resolvePipeline(p)]))
  assert.equal(back.label, 'Default')
  assert.equal(back.detect.rules.length, p.detect.rules.length)
  assert.deepEqual(back.detect.rules.map((r) => r.match), p.detect.rules.map((r) => r.match))
  assert.deepEqual(back.detect.rules.map((r) => r.action), p.detect.rules.map((r) => r.action))
  assert.deepEqual(back.stages.map((s) => s.kind), p.stages.map((s) => s.kind))
}

console.log('checkDefaultPipeline ok')
