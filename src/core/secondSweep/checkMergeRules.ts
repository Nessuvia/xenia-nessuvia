// Run: node --experimental-strip-types src/core/secondSweep/checkMergeRules.ts
import assert from 'node:assert/strict'
import { mergeRules, looksLegacy } from './mergeRules.ts'
import { resolveDetect } from './detectSettings.ts'
import { collectFindings } from './collect.ts'

const hammer = [
  {
    id: 'h1',
    enabled: true,
    label: 'filler',
    pattern: 'with a [adj] [noun]',
    action: 'strip',
    scope: 'assistant',
    caseSensitive: false,
  },
  {
    id: 'h2',
    enabled: true,
    pattern: '[adv] [adj]',
    action: 'replace',
    replacement: '$2',
    scope: 'both',
    caseSensitive: true,
  },
]

const text = [
  { id: 't1', enabled: true, find: 'perhaps', regex: false, caseSensitive: false, scope: 'assistant', note: 'no hedging' },
  { id: 't2', enabled: false, find: 'a\\s+beat', regex: true, caseSensitive: true, scope: 'user', note: 'no beats' },
  { id: 't3', enabled: true, find: '', regex: false, caseSensitive: false, scope: 'assistant', note: 'Never name an emotion.' },
]

// --- every old rule converts, in run order --------------------------------
{
  const merged = mergeRules(hammer, text)
  assert.equal(merged.length, 5)
  // Hammer rules first: that is the order `collectFindings` ran the two lists in, so a converted
  // pipeline behaves on its first run the way it did on its last.
  assert.deepEqual(merged.map((r) => r.match), ['pattern', 'pattern', 'literal', 'regex', 'literal'])

  const [strip, replace, hedging, beats, standing] = merged
  // A hammer pattern lands in `find`, which is the field the merged rule matches on.
  assert.equal(strip.find, 'with a [adj] [noun]')
  assert.equal(strip.action, 'strip')
  assert.equal(strip.label, 'filler')
  assert.equal(replace.action, 'replace')
  assert.equal(replace.replacement, '$2')
  assert.equal(replace.scope, 'both')
  assert.equal(replace.caseSensitive, true)

  // A text rule could only ever report, so it converts to a flag and keeps its note.
  assert.equal(hedging.action, 'flag')
  assert.equal(hedging.note, 'no hedging')
  assert.equal(beats.match, 'regex')
  assert.equal(beats.enabled, false)
  assert.equal(beats.scope, 'user')
  // A blank find is still a standing rule after the merge.
  assert.equal(standing.find, '')
  assert.equal(standing.note, 'Never name an emotion.')
}

// --- a missing list is not an error ---------------------------------------
{
  assert.deepEqual(mergeRules(undefined, undefined), [])
  assert.equal(mergeRules(hammer, undefined).length, 2)
  assert.equal(mergeRules(undefined, text).length, 3)
  // Junk in a stored blob is skipped rather than crashing a pipeline read.
  assert.equal(mergeRules([null, 'nope'], []).length, 0)
}

// --- only an old blob is converted ----------------------------------------
{
  assert.equal(looksLegacy([]), false)
  assert.equal(looksLegacy(undefined), false)
  assert.equal(looksLegacy(hammer), true)
  assert.equal(looksLegacy(text), true)
  // A current rule carries `match`, and converting one would wipe its action.
  assert.equal(looksLegacy(mergeRules(hammer, text)), false)
}

// --- resolveDetect converts on read, and drops the old field --------------
{
  const detect = resolveDetect({ rules: hammer, textRules: text } as never)
  assert.equal(detect.rules.length, 5)
  // The old field must not survive onto the resolved object: it would be written back to Dexie on
  // the next save and converted a second time.
  assert.equal('textRules' in detect, false)

  // Reading an already-merged pipeline leaves it alone.
  const again = resolveDetect(detect)
  assert.deepEqual(again.rules, detect.rules)
}

// --- a converted rule still does what it did ------------------------------
{
  const detect = resolveDetect({
    rules: [hammer[0]],
    textRules: [text[0], text[2]],
    punctuation: { dashes: false, quotes: false },
  } as never)

  const out = collectFindings('She runs with a graceful elegance. Perhaps.', detect)
  // The hammer rule still cuts.
  assert.ok(!out.cleaned.includes('graceful'))
  assert.equal(out.edited, true)
  // The text rule still reports, against the edited text.
  assert.equal(out.notes.length, 1)
  assert.equal(out.notes[0].message, 'no hedging')
  // The standing rule is still kept apart from the matches.
  assert.equal(out.standing.length, 1)
}

console.log('checkMergeRules ok')
