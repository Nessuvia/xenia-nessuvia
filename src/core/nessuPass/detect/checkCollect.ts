// Run: node --experimental-strip-types src/core/nessuPass/detect/checkCollect.ts
import assert from 'node:assert/strict'
import { collectFindings } from './collect.ts'
import { resolveDetect, type DetectSettings } from './types.ts'

const base = resolveDetect()

/** Detectors off, so a case only sees what it turns on. */
const quiet: DetectSettings = {
  ...base,
  repetition: { ...base.repetition, enabled: false },
  sprawl: { ...base.sprawl, enabled: false },
  triplet: { ...base.triplet, enabled: false },
}

// --- the mechanical edits happen with no request --------------------------
{
  const detect: DetectSettings = { ...quiet, punctuation: { dashes: true, quotes: true } }
  const out = collectFindings('She waited — then left. "Fine…"', detect)
  assert.ok(!out.cleaned.includes('—'))
  assert.ok(!out.cleaned.includes('…'))
  assert.ok(!out.cleaned.includes('“'))
  assert.equal(out.edited, true)

  // Nothing to fix means nothing changed, which is what a gate reads as clean.
  const clean = collectFindings('She waited, then left.', detect)
  assert.equal(clean.edited, false)
  assert.equal(clean.notes.length, 0)
}

// --- turning a check off silences it --------------------------------------
{
  const sprawler =
    'She walked to the door, and then she stopped, and then she turned around, and then she looked back at him, and then she said nothing at all, and then she left the room entirely.'
  assert.equal(collectFindings(sprawler, quiet).notes.length, 0)
  const on = collectFindings(sprawler, { ...quiet, sprawl: { ...base.sprawl, enabled: true } })
  assert.equal(on.notes.length, 1)
  // Every note quotes the slice it is about: that is what makes the edit targeted.
  assert.ok(on.notes[0].message.length > 0)
}

// --- a standing rule is not a found problem -------------------------------
{
  // No `find`, so it applies to every passage rather than matching this one.
  const standing = {
    id: 's1',
    enabled: true,
    find: '',
    regex: false,
    caseSensitive: false,
    scope: 'assistant' as const,
    note: 'Never name an emotion outright.',
  }
  const out = collectFindings('She was fine.', { ...quiet, textRules: [standing] })
  assert.equal(out.notes.length, 0)
  assert.equal(out.standing.length, 1)
  // The two lists are kept apart on purpose: the gate counts them separately, and the prompt
  // renders standing rules as the style guide rather than as failures against it.
  assert.equal(out.standing[0].message, 'Never name an emotion outright.')
}

// --- the detectors see the cleaned text, not the original -----------------
{
  const rule = {
    id: 'r1',
    enabled: true,
    find: 'waited — then',
    regex: false,
    caseSensitive: false,
    scope: 'assistant' as const,
    note: 'no',
  }
  // The em dash is gone by the time the rule runs, so a rule written against the raw text misses.
  // That is the contract: the model is shown `cleaned`, and a note must quote what it will see.
  const out = collectFindings('She waited — then left.', { ...quiet, textRules: [rule] })
  assert.equal(out.notes.length, 0)
}

// --- a user turn is judged by the rules scoped to it ----------------------
{
  const rule = {
    id: 'r2',
    enabled: true,
    find: 'perhaps',
    regex: false,
    caseSensitive: false,
    scope: 'assistant' as const,
    note: 'no hedging',
  }
  const detect = { ...quiet, textRules: [rule] }
  assert.equal(collectFindings('perhaps', detect, { role: 'assistant' }).notes.length, 1)
  assert.equal(collectFindings('perhaps', detect, { role: 'user' }).notes.length, 0)
  // No role given means assistant: the pass runs on replies, so that is the useful default.
  assert.equal(collectFindings('perhaps', detect).notes.length, 1)
}

// --- repetition needs history, and shrugs without it ----------------------
{
  const detect = { ...quiet, repetition: { enabled: true, phrase: 4, repeats: 2, lookback: 8 } }
  const line = 'the air between them thickened'
  assert.equal(collectFindings(line, detect).notes.length, 0)
  const repeated = collectFindings(line, detect, { history: [line, line] })
  assert.equal(repeated.notes.length, 1)
}

console.log('checkCollect ok')
