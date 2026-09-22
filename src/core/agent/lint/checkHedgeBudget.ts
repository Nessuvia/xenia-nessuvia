import assert from 'node:assert'
import { applyLint, defaultLintConfig } from '../lintRules.ts'
import { loadVad } from '../../quality/vad.ts'

await loadVad()

const fix = (text: string) =>
  applyLint(text, { ...defaultLintConfig, enabled: true, mode: 'fix', off: ['adverb-placement', 'intensifier-budget', 'ambient-filler'] }).text

// The reason this is a budget and not a lexicon entry: cutting a hedge before a verb reverses the
// sentence. These must survive any amount of over-budget pressure.
const verbs = 'She almost smiled. He barely made it. They nearly fell. It hardly moved. She almost laughed. He barely spoke. They nearly ran. It hardly stirred.'
assert.strictEqual(fix(verbs), verbs, 'a hedge before a verb is never cut')

// Before an adjective or adverb it is decoration and goes once the paragraph is over budget.
const many = 'The room was almost warm, faintly damp, vaguely familiar, mildly sour, barely bright, slightly cold.'
const fixed = fix(many)
assert.ok(fixed.length < many.length, 'an over-budget paragraph loses hedges')
assert.ok(!/faintly damp/.test(fixed) || !/vaguely familiar/.test(fixed), 'at least one pre-modifier went')

// The four negating hedges are never cut, in any position: "almost warm" means not warm.
const negators = 'The room was almost warm, barely bright, nearly dry, hardly clean, almost still, barely lit.'
assert.strictEqual(fix(negators), negators, 'negating hedges are never removed')

// They still spend the budget, so their presence pushes a softener out instead.
const mixed = 'The room was almost warm, barely bright, nearly dry, hardly clean, faintly sour.'
assert.ok(!/faintly sour/.test(fix(mixed)), 'the softener goes once the negators have spent the budget')

// The rate: base 1 per 100 words, so cold narration under 100 words allows none. Same as
// intensifierBudget, and the reason a single softener in a short paragraph still goes.
const short = 'The room was faintly warm, and the window let in a grey light.'
assert.ok(!/faintly/.test(fix(short)), 'a cold short paragraph allows no hedge')

// Long enough and one is under budget.
const long = 'The room was faintly warm. ' + 'He looked at the window and the floor and the chair and the door and the wall again. '.repeat(6)
assert.ok(/faintly/.test(fix(long)), 'a long cold paragraph allows one')

// Dialogue is the character's voice. It neither spends the budget nor gets cut.
const speech = '"It was almost sweet, barely warm, vaguely wrong, mildly odd, faintly sour," she said.'
assert.strictEqual(fix(speech), speech, 'quoted hedges are left alone')

// Part of a construction rather than decoration.
assert.strictEqual(fix('He could barely warm his hands. She would hardly notice.'), 'He could barely warm his hands. She would hardly notice.')

// A sentence opener keeps its footing.
assert.ok(fix('Apparently, warm air still reached the far corner of the room.').startsWith('Apparently,'))

console.log('hedgeBudget ok')
