// Run: node --experimental-strip-types src/core/secondSweep/checkLegacy.ts
import assert from 'node:assert/strict'
import {
  legacyEnabled,
  passArraysFrom,
  pipelinesFromLegacy,
  type LegacyGoldPass,
  type LegacySecondPass,
} from './legacy.ts'
import type { CleanStage, RewriteStage, ScoreStage } from './pipeline.ts'

const second: LegacySecondPass = {
  enabled: true,
  connectionId: 'c-writer',
  skipWhenClean: false,
  userPrompt: 'Keep it terse.',
  rules: [
    { id: 'h1', enabled: true, pattern: 'with a [adj] [noun]', action: 'strip', scope: 'assistant', caseSensitive: false },
  ],
  textRules: [
    { id: 't1', enabled: true, find: 'perhaps', regex: false, caseSensitive: false, scope: 'assistant', note: 'no hedging' },
  ],
  punctuation: { dashes: false, quotes: true },
}

const gold: LegacyGoldPass = {
  enabled: false,
  connectionId: 'c-local',
  presets: [
    { id: 'p1', label: 'Terse', text: 'Rewrite tersely.' },
    { id: 'p2', label: '', text: 'Rewrite warmly.' },
  ],
  presetId: 'p2',
  historyCount: 9,
  includeCharacter: false,
  minRatio: 0.4,
  maxRatio: 3,
  lexicon: [{ id: 'l1', phrase: 'a beat passed', regex: false, enabled: true, weight: 2 }],
  promptBannedList: false,
}

// --- both blobs: one pipeline per preset, clean first ----------------------
{
  const { pipelines, activeIndex, byPresetId } = pipelinesFromLegacy(second, gold)
  assert.equal(pipelines.length, 2)
  // The two ran in this order, so the stages come out in it.
  assert.deepEqual(pipelines[0].stages.map((s) => s.kind), ['clean', 'rewrite', 'score'])
  // The selected preset is the one the new setting points at.
  assert.equal(activeIndex, 1)
  assert.deepEqual(byPresetId, { p1: 0, p2: 1 })
  // A preset with no label still gets a name rather than an empty row in the library.
  assert.ok(pipelines[1].label.trim().length > 1)

  // Every pipeline carries the same checks and lexicon, and its own stage objects.
  for (const p of pipelines) {
    assert.equal(p.detect.textRules[0].note, 'no hedging')
    assert.equal(p.detect.punctuation.dashes, false)
    // A check the old blob never wrote still resolves, rather than arriving undefined.
    assert.equal(p.lexicon[0].phrase, 'a beat passed')
  }
  assert.notEqual(pipelines[0].stages[0].id, pipelines[1].stages[0].id)

  const clean = pipelines[0].stages[0] as CleanStage
  assert.equal(clean.config.connectionId, 'c-writer')
  assert.equal(clean.config.userPrompt, 'Keep it terse.')
  // skipWhenClean lands on the clean stage, never as a gate: a gate would stop the rewrite too,
  // and the old flag only ever skipped the edit request.
  assert.equal(clean.config.skipWhenClean, false)
  assert.ok(!pipelines[0].stages.some((s) => s.kind === 'gate'))

  const rewrite = pipelines[0].stages[1] as RewriteStage
  assert.equal(rewrite.config.connectionId, 'c-local')
  assert.equal(rewrite.config.preset, 'Rewrite tersely.')
  assert.equal(rewrite.config.historyCount, 9)
  assert.equal(rewrite.config.includeCharacter, false)
  assert.equal(rewrite.config.promptBannedList, false)
  // Not written by the old blob, so it keeps the default rather than resolving undefined.
  assert.equal(rewrite.config.samplerBannedList, true)

  const score = pipelines[0].stages[2] as ScoreStage
  assert.equal(score.config.minRatio, 0.4)
  assert.equal(score.config.maxRatio, 3)
  assert.equal(typeof score.config.quality.weights.slop, 'number')
}

// --- one blob at a time ---------------------------------------------------
{
  // Second Pass alone: one clean-only pipeline, and nothing that needs a second connection.
  const onlySecond = pipelinesFromLegacy(second, undefined)
  assert.equal(onlySecond.pipelines.length, 1)
  assert.deepEqual(onlySecond.pipelines[0].stages.map((s) => s.kind), ['clean'])
  assert.equal(onlySecond.activeIndex, 0)

  // Gold Pass alone: no clean stage in front of the rewrite.
  const onlyGold = pipelinesFromLegacy(undefined, gold)
  assert.equal(onlyGold.pipelines.length, 2)
  assert.deepEqual(onlyGold.pipelines[0].stages.map((s) => s.kind), ['rewrite', 'score'])

  // Neither: nothing to import, and the caller leaves the settings alone.
  assert.deepEqual(pipelinesFromLegacy(undefined, undefined).pipelines, [])
  assert.equal(pipelinesFromLegacy(undefined, undefined).activeIndex, -1)

  // A blob that only ever held defaults is not a setup. Importing it would leave a pipeline the
  // user never made, and the library is a list of things they did.
  const untouched: LegacySecondPass = { enabled: false, rules: [], textRules: [], userPrompt: '' }
  assert.deepEqual(pipelinesFromLegacy(untouched, undefined).pipelines, [])
  // ...but a rule list is authorship, even with the feature switched off.
  assert.equal(pipelinesFromLegacy({ ...untouched, rules: second.rules }, undefined).pipelines.length, 1)

  // A preset with no text was never armed and cannot be now.
  const blank = pipelinesFromLegacy(undefined, { presets: [{ id: 'x', label: 'x', text: '  ' }] })
  assert.deepEqual(blank.pipelines, [])
}

// --- a stale presetId falls back rather than inventing a choice ------------
{
  const { activeIndex } = pipelinesFromLegacy(second, { ...gold, presetId: 'deleted' })
  assert.equal(activeIndex, 0)
}

// --- the global toggle: either feature being on means replies were passed --
{
  assert.equal(legacyEnabled(second, gold), true) // second on, gold off
  assert.equal(legacyEnabled({ enabled: false }, { enabled: true }), true)
  assert.equal(legacyEnabled({ enabled: false }, { enabled: false }), false)
  assert.equal(legacyEnabled(undefined, undefined), false)
}

// --- message arrays -------------------------------------------------------
{
  // Nothing to convert: the sweep skips the write rather than rewriting every message it sees.
  assert.equal(passArraysFrom({}), null)

  // Both passes ran on swipe 0. Second Pass ran first, so its draft is what the model actually
  // said; `goldOriginals` holds the text *after* the edit, which is not the original.
  const both = passArraysFrom({
    drafts: ['raw'],
    goldOriginals: ['edited'],
    goldSummaries: ['Rewrote 2 of 3 passages.'],
  })!
  assert.deepEqual(both.passOriginals, ['raw'])
  assert.deepEqual(both.passSummaries, ['Rewrote 2 of 3 passages.'])
  assert.deepEqual(both.passFailed, [undefined])

  // Only one of the two ran: whichever exists is the original.
  assert.deepEqual(passArraysFrom({ drafts: ['raw'] })!.passOriginals, ['raw'])
  assert.deepEqual(passArraysFrom({ goldOriginals: ['raw'] })!.passOriginals, ['raw'])

  // Ragged arrays: a message whose passes ran on different swipes pads to the longest, so all
  // three stay parallel to `swipes` and a hole keeps its index.
  const ragged = passArraysFrom({
    drafts: [undefined, 'two raw'],
    goldOriginals: ['one edited', undefined, 'three edited'],
    goldFailed: [undefined, undefined, 'The rewrite came back empty.'],
  })!
  assert.deepEqual(ragged.passOriginals, ['one edited', 'two raw', 'three edited'])
  assert.equal(ragged.passSummaries.length, 3)
  assert.deepEqual(ragged.passFailed, [undefined, undefined, 'The rewrite came back empty.'])
}

console.log('checkLegacy ok')
